const _uuid = require('uuid');
const moment = require('moment');
const _ = require('lodash');
//处理飞书相关的事件推送
//数据库mock方法
const CRUD = {
  findAsync: () => { console.log('findAsync'); },
  removeAsync: () => { console.log('removeAsync'); },
  updateAsync: () => { console.log('updateAsync'); },
  insertAsync: () => { console.log('insertAsync'); }
};
const db = {
  'feishu_event': CRUD,
  //飞书token存储在数据库中，也可选择其他存储方式
  'feishu_token': CRUD,
  'user': CRUD,
  'company': CRUD,
  'department': CRUD
}

const requestFactory = require('./requestFactory');
const msgFactory = require('./msgFactory');
const defaultData = require('./defaultData');

const unlimited_end = '2100-01-01';
//根据购买方案来处理公司租期，人员容量等数据
function getCompanyTenancyData(planType, planData) {
  let companyTenancyData = {
    start: moment().format('YYYY-MM-DD'),
    end: unlimited_end,
    maxPeople: planData.seats,
    accountType: 'ordinary'
  }
  if (planType === 'permanent') { //免费体验版
    companyTenancyData = {
      ...companyTenancyData,
      maxPeople: 10,
      accountType: 'test'
    };

    return companyTenancyData;
  }

  if (planType.includes('per_seat')) {  //按人付费版
    if (planType.includes('month')) {  //月付，则每多一个月，租期结束时间就多加一个月
      companyTenancyData.end = moment().add(1, 'months').format('YYYY-MM-DD');
    }
    if (planType.includes('year')) { //年付
      companyTenancyData.end = moment().add(1, 'years').format('YYYY-MM-DD');
    }

    return companyTenancyData;
  }

  //返回默认租期方案
  return companyTenancyData;
}

const TYPE_EVENT_MAPPING = {
  //用户购买应用商店付费应用成功后发送给应用ISV的通知事件
  order_paid: function (data) { 
    return new Promise(async resolve => {
      let { uuid, event } = data;
      let companyTenancyData = getCompanyTenancyData(event.price_plan_type, event);

      let now = new Date().getTime();
      let companyObj = {
        id: event.tenant_key,
        name: '飞书引用平台' + event.tenant_key,
        updateTime: now,
        ...companyTenancyData,
        from: 'feishu',
        feishu_eventIds: [uuid]
      };

      let app_access_token = await getLocalApp_access_token();
      let tenant_access_token = await requestFactory.getTenant_access_token(app_access_token, event.tenant_key);
      let existedCompany = (await db.company.findAsync({ id: event.tenant_key }))[0];
      if (existedCompany) {
        //多付费方案采用叠加原则,如果是前后2个方案都是付费方案，则增加的人数需要计算这2个付费方案的人数差值
        
        //当前方案为“升级购买”人数，且有上一个付费方案的订单，则新增人数为这2个付费方案的差值
        if (event.buy_type === 'upgrade' && event.src_order_id) {
          let src_order = await requestFactory.getOrder(event.src_order_id, tenant_access_token);
          let addPeopleNum = event.seats - src_order.seats;
          companyObj.maxPeople = existedCompany.maxPeople + addPeopleNum;
          //租期不变
          companyObj.start = existedCompany.start;
          companyObj.end = existedCompany.end;
          //增购成功，给超级管理员发送消息卡片
          await requestFactory.sendMessageCard(tenant_access_token, { open_id: existedCompany.adminid }, msgFactory.MSG_ORDER_UPGRADE);

        } else {  //免费方案升级为收费方案
          companyObj.maxPeople = existedCompany.maxPeople + companyObj.maxPeople;
          //若上一条订单是免费体验版，则付费方案更改后，租期（开始，到期时间）按照新的付费方案租期来

          //付费方案变更，给超级管理员发送消息卡片
          await requestFactory.sendMessageCard(tenant_access_token, { open_id: existedCompany.adminid }, msgFactory.MSG_ORDER_CHANGE);
        }

        companyObj.name = existedCompany.name;
        companyObj.feishu_eventIds = existedCompany.feishu_eventIds.concat(companyObj.feishu_eventIds);
        await db.company.updateAsync({ id: event.tenant_key }, companyObj);
      } else {
        companyObj = { 
          ...companyObj,
          createTime: now,
          logo: defaultData.logo,  //缺省logo
        };
        await db.company.insertAsync(companyObj);

        //同步部门组织结构
        let departmentDatas = await requestFactory.getAllDepartmentDatas(tenant_access_token);
        let departmentObjs = [];
        for (let i = 0; i < departmentDatas.length; i++) {
          let dep = departmentDatas[i];
          //部门去重
          let targetDepartment = departmentObjs.find(elem => elem.id === dep.open_department_id);
          if (targetDepartment) { continue; }

          let depObj = {
            id: dep.open_department_id,
            name: dep.name,
            member_count: dep.member_count,
            companyId: event.tenant_key,
            parentId: dep.parent_open_department_id,
            status: dep.status,
            createTime: now,
            updateTime: now,
            from: 'feishu',
            info: dep
          };

          //没有父部门id，则该部门就为父部门
          if (!depObj.parentId) { depObj.root = 1; }
          departmentObjs.push(depObj);
        }
        await db.department.insertAsync(departmentObjs);
      }

      //购买应用，增购，续费都会重新同步数据
      await initUserData(event.tenant_key);
      
      resolve('ok');
    });
  },
  //首次启用应用,当租户管理员后台首次开通应用时触发此事件
  app_open: function (data) {
    return new Promise(async resolve => {
      let { tenant_key, installer } = data.event;
      installer = installer||{};
      let app_access_token = await getLocalApp_access_token();
      let tenant_access_token = await requestFactory.getTenant_access_token(app_access_token, tenant_key);

      let userDatas = await requestFactory.getUserDatas(tenant_access_token, [installer.open_id]);
      let userInfo = userDatas[0]||{};

      await db.company.updateAsync({ id: tenant_key }, { installer: { 
        id: installer.open_id,
        name: userInfo.name || '-'
      }});

      //给应用安装者发送设置成为超级管理员的消息
      let cardContent = msgFactory.MSG_ADMIN_WELCOME;
      await requestFactory.sendMessageCard(tenant_access_token, { open_id: installer.open_id }, cardContent);

      resolve('ok');
    });
  },
  //对于应用商店应用，开放平台会每隔1小时推送一次 app_ticket ，应用通过该 app_ticket 获取 app_access_token。
  app_ticket: function (data) {
    return new Promise(async resolve => {
      let { event } = data;
      global.app_ticket = event.app_ticket;

      let tokenData = await requestFactory.getApp_access_token(event.app_ticket);
      //清空飞书token数据
      await db.feishu_token.removeAsync({});
      await db.feishu_token.insertAsync({
        id: _uuid.v1(),
        ...tokenData
      });
      resolve('ok');
    });
  },
  //部门新增,只有在企业通讯录授权范围内的部门变化才会推送事件。
  //特殊说明：用户创建新部门时，如果将create_group_chat设置为true，
  //会收到两条事件：分别为「部门新增」、「部门信息变化」（chat_id由空更新为具体值）。
  "contact.department.created_v3": function (data) {
    return new Promise(async resolve => {
      let companyid = data.header.tenant_key;
      let feishu_department = data.event.object;
      let now = new Date().getTime();

      let departmentObj = {
        id: feishu_department.open_department_id,
        name: feishu_department.name,
        member_count: feishu_department.member_count,
        companyid: companyid,
        parentId: feishu_department.parent_department_id,
        status: feishu_department.status,
        createTime: now,
        updateTime: now,
        from: 'feishu',
        info: feishu_department
      };

      if (!departmentObj.parentId) { departmentObj.root = 1; }
      await db.department.insertAsync(departmentObj);
      resolve('ok');
    });
  },
  //部门被删除,特殊说明：如果删除的部门有部门群，会收到两条事件：
  //分别为「部门信息变化」（chat_id被更新为空）和「部门被删除」
  "contact.department.deleted_v3": function (data) {
    return new Promise(async resolve => {
      //TODO

      resolve('ok');
    });
  },
  //部门信息变化,如果用户通过企业管理后台做变更时，针对于每个字段的变更都会发送一条更新事件。
  "contact.department.updated_v3": function (data) {
    return new Promise(async resolve => {
      let { object: new_object, old_object } = data.event;
      let departmentId = new_object.open_department_id;
      let updateObj = {};
      for (const key in old_object) {
        updateObj[key] = new_object[key];
      }

      await db.department.updateAsync({ id: departmentId }, updateObj);
      resolve('ok');
    });
  },
  //员工信息变化
  "contact.user.updated_v3": function (data) {
    return new Promise(async resolve => {
      let { object: new_object, old_object } = data.event;
      let userid = new_object.open_id;
      let updateObj = {};
      const fieldsList = Object.keys(userFields_feishu_xxxx_mapping);
      for (const feishu_key in old_object) {
        if (!fieldsList.includes(feishu_key)) {
          continue;
        }
        let xxxx_key = userFields_feishu_xxxx_mapping[feishu_key];
        switch (feishu_key) {
          case "join_time":
            updateObj[xxxx_key] = moment(new_object[feishu_key]*1000).format('YYYY-MM-DD');
            break;
          case "gender":
            updateObj[xxxx_key] = new_object[feishu_key] ? (new_object[feishu_key] === 1 ? '男':'女') : '-';
            break;
          case "name":
            updateObj.name = new_object[feishu_key];
            updateObj.nickname = new_object[feishu_key];
            break;
          case "mobile":
            updateObj.mobile = new_object[feishu_key].replace('+86', '');
            break;
          default:
            updateObj[xxxx_key] = new_object[feishu_key];
            break;
        }
      }

      await db.user.updateAsync({ id: userid }, updateObj);
      resolve('ok');
    });
  },
  //离职事件
  //特殊说明：object中的用户状态会变为离职，数据中不会包括department_ids和orders字段。
  "contact.user.deleted_v3": function (data) {
    return new Promise(async resolve => {
      let { object } = data.event;
      let userid = object.open_id;

      //TODO
      let deleted_update = {};
      await db.user.updateAsync({ id: userid, from: "feishu" }, deleted_update);
      resolve('ok');
    });
  },
  //用户和机器人的会话首次被创建：用户首次打开机器人聊天窗口时，收到的欢迎信息
  //首次会话是用户了解应用的重要机会，你可以发送操作说明、配置地址来指导用户开始使用你的应用。
  "p2p_chat_create": function (data) {
    return new Promise(async resolve => {
      let { user, tenant_key, operator } = data.event;

      let company = (await db.company.findAsync({ id: tenant_key },1,1))[0];
      //超级管理员，去掉作为员工的那条欢迎信息（即去重）
      if (company && (company.installer||{}).id === user.open_id) {
        return resolve('ok');
      }

      //若xxxx发送消息给用户，被动触发了会话创建，则不发送欢迎消息
      if (user.open_id !== (operator||{}).open_id) {
        return resolve('ok');
      }

      let app_access_token = await getLocalApp_access_token();
      let tenant_access_token = await requestFactory.getTenant_access_token(app_access_token, tenant_key);
      await requestFactory.sendMessageCard(tenant_access_token, { open_id: user.open_id }, msgFactory.MSG_CHAT_CREATE);
      resolve('ok');
    });
  },
  //接收消息
  //当用户发送消息给机器人或在群聊中@机器人时触发此事件
  "message": function (data) {
    return new Promise(async resolve => {
      let { open_id, open_chat_id, tenant_key, chat_type, text_without_at_bot } = data.event;
      //处理消息文本中多余的标签
      let text = (text_without_at_bot||'').replace(new RegExp('<at open_id=\".*\">.*</at>', 'g'), '');

      let app_access_token = await getLocalApp_access_token();
      let tenant_access_token = await requestFactory.getTenant_access_token(app_access_token, tenant_key);
      if (chat_type === "private") { //私聊
        let msgCard;
        switch (text) {
          case '我的任务':
            msgCard = msgFactory.MSG_CHAT_TASK;
            break;
          //若关键字无法识别，则发送“无法识别”消息
          default:
            msgCard = msgFactory.MSG_CHAT_UNIDENTIFIED;
            break;
        }
        
        await requestFactory.sendMessageCard(tenant_access_token, { open_id: open_id }, msgCard);
        return resolve('ok');
      }

      if (chat_type === "group") {  //群聊
        await requestFactory.sendMessageCard(tenant_access_token, { chat_id: open_chat_id }, msgFactory.MSG_REBORT_WELCOME);
        return resolve('ok');
      }
    });
  },
  //机器人进群,机器人被邀请加入群聊时触发此事件
  "add_bot": function (data) {
    return new Promise(async resolve => {
      let { open_chat_id, tenant_key } = data.event;
      let app_access_token = await getLocalApp_access_token();
      let tenant_access_token = await requestFactory.getTenant_access_token(app_access_token, tenant_key);
      
      await requestFactory.sendMessageCard(tenant_access_token, { chat_id: open_chat_id }, msgFactory.MSG_REBORT_ADD);
      resolve('ok');
    });
  }
}

//飞书数据字段——自身公司开发字段的映射表：键：飞书字段，值：自身公司字段
const userFields_feishu_xxxx_mapping = {
  "department_ids": "department",
  "city": "city",
  "email": "email",
  "mobile": "mobile",
  "join_time": "joinTime",
  "employee_no": "incompanyid",
  "gender": "sex",
  "work_station": "position",
  "en_name": "name_en",
  "name": "nickname"
};

function addEventData(data) {
  return new Promise(async resolve => {
    //新版订阅事件数据结构不一样，需做不同的处理
    if (data.schema === '2.0') { 
      let { header, event } = data;
      let event_id = header.event_id;
      await db.feishu_event.insertAsync({ id: event_id, ...header, ...event });
      return resolve('ok');
    }

    //旧版订阅事件的存储处理
    let { uuid, token, ts, event } = data;
    await db.feishu_event.insertAsync({ id: uuid, token, ts, ...event });
    resolve('ok');
  });
}

function checkIsExistEvent(eventId) {
  return new Promise(async resolve => {
    let event = (await db.feishu_event.findAsync({ id: eventId }))[0];
    resolve(event ? true : false);
  }); 
}

const employee_type_mapping = {
  1: '正式员工',
  2: '实习生',
  3: '外包',
  4: '劳务',
  5: '顾问'
};

//初始化飞书用户数据
function initUserData(tenant_key) {
  return new Promise(async resolve => {
    let app_access_token = await getLocalApp_access_token();
    let tenant_access_token = await requestFactory.getTenant_access_token(app_access_token, tenant_key);
    let scopeData = await requestFactory.getScopeData(tenant_access_token);
    let open_ids = scopeData.authed_open_ids; //不在一级部门下的用户数据
  
    let departmentIds = scopeData.authed_open_departments||[];  //所有一级部门id
    //同步部门组织结构
    let now = new Date().getTime();
    let departmentDatas = await requestFactory.getAllDepartmentDatas(tenant_access_token);
    let departmentObjs = [];
    for (let i = 0; i < departmentDatas.length; i++) {
      let dep = departmentDatas[i];
      //部门去重
      let targetDepartment = departmentObjs.find(elem => elem.id === dep.open_department_id);
      if (targetDepartment) { continue; }

      let depObj = {
        id: dep.open_department_id,
        name: dep.name,
        member_count: dep.member_count,
        companyid: tenant_key,
        parentId: dep.parent_open_department_id,
        status: dep.status,
        createTime: now,
        updateTime: now,
        from: 'feishu',
        info: dep
      };

      if (!depObj.parentId) { depObj.root = 1; }
      departmentObjs.push(depObj);
    }
    await db.department.removeAsync({ companyid: tenant_key });
    await db.department.insertAsync(departmentObjs);

    let allOpen_ids = [...open_ids]; //所有飞书用户id
    //查询所有一级部门下的所有用户数据
    for (let i = 0; i < departmentIds.length; i++) {
      let departmentId = departmentIds[i];
      let departmentUserDatas = await requestFactory.getAllUserDatasByDepartmentId(tenant_access_token, departmentId);
      allOpen_ids = allOpen_ids.concat(departmentUserDatas.map(user => user.open_id));
    }
    allOpen_ids = _.uniq(allOpen_ids);

    let userDatas = []; 
    const data_size = 100;
    const batchNum = Math.ceil(allOpen_ids.length/data_size);
    for (let i = 0; i < batchNum; i++) {
      let batchOpen_ids = allOpen_ids.slice(i*data_size, (i+1)*data_size);
      let batchUserDatas = await requestFactory.getUserDatas(tenant_access_token, batchOpen_ids);
      userDatas = userDatas.concat(batchUserDatas);
    }

    let xxxx_users = userDatas.map(user => {
      let userObj = {
        id: user.open_id,
        nickname: user.name,
        name: user.name,
        en_name: user.en_name,
        pp: user.avatar_640,
        sex: user.gender ? (user.gender === 1 ? '男':'女') : '-',
        incompanyid: user.employee_no,
        companyid: tenant_key,
        position: user.work_station,
        createTime: now,
        updateTime: now,
        joinTime: user.join_time ? moment(user.join_time*1000).format('YYYY-MM-DD') : '-',
        department: user.open_departments||[],
        title: employee_type_mapping[user.employee_type],
        email: user.email,
        password: user.email||'123',
        mobile: user.mobile||'',
        status: user.status,
        userInfo: user,
        from: 'feishu'
      };

      return userObj;
    });

    await db.feishu_user.removeAsync({ companyid: tenant_key });
    await db.feishu_user.insertAsync(xxxx_users);

    resolve('ok');
  });
}

function getLocalApp_access_token() {
  return new Promise(async resolve => {
    let tokenData = (await db.feishu_token.findAsync({},1,1))[0]||{};
    let app_access_token = tokenData.app_access_token||null;

    resolve(app_access_token);
  });
}

module.exports = {
  TYPE_EVENT_MAPPING,
  TYPE_EVENT_LIST: Object.keys(TYPE_EVENT_MAPPING),
  addEventData: addEventData,
  checkIsExistEvent: checkIsExistEvent,
  initUserData: initUserData,
  getLocalApp_access_token: getLocalApp_access_token
};