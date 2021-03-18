//获取飞书请求库
const request = require("request");
const config = require('./config.json');
const app_id = config.app_id;  //应用唯一标识，创建应用后获得
const app_secret = config.app_secret;  //应用秘钥，创建应用后获得

//重新推送 app_ticket
//飞书每隔 1 小时会给应用推送一次最新的 app_ticket，应用也可以主动调用此接口，触发飞书进行及时的重新推送。
function requestResendApp_ticket() {
  request.post({
    url: 'https://open.feishu.cn/open-apis/auth/v3/app_ticket/resend/',
    headers: { 'Content-Type': 'application/json' },
    body: {
      'app_id': app_id,
      'app_secret': app_secret
    },
    json: true
  }, (err, res, result) => {
    console.log('重新推送app_ticket成功，结果：',result);
  });
}

//获取 app_access_token（应用商店应用）
function getApp_access_token(app_ticket) {
  return new Promise(resolve => {
    request.post({
      url: 'https://open.feishu.cn/open-apis/auth/v3/app_access_token/',
      headers: { 'Content-Type': 'application/json' },
      body: {
        'app_id': app_id,
        'app_secret': app_secret,
        'app_ticket': app_ticket
      },
      json: true
    }, async (err, res, body) => {
      if (err) {
        await requestResendApp_ticket();
        return resolve(null);
      }
      if (typeof body === 'string') { body = JSON.stringify(body); }
      let app_access_token = body.app_access_token;
      let expire = body.expire;
      resolve({
        app_access_token, expire,
        createTime: new Date().getTime()
      });
    });
  });
}

//获取 tenant_access_token（应用商店应用）
function getTenant_access_token(app_access_token, tenant_key) {
  return new Promise(resolve => {
    request.post({
      url: 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/',
      headers: { 'Content-Type': 'application/json' },
      body: {
        'app_access_token': app_access_token,
        'tenant_key': tenant_key
      },
      json: true
    }, (err,res, body) => {
      if (err) {
        return resolve(null);
      }
      if (typeof body === 'string') { body = JSON.parse(body); }
      let tenant_access_token = body.tenant_access_token;
      resolve(tenant_access_token);
    });
  });
}

//获取登录用户身份
//通过此接口获取登录预授权码 code 对应的登录用户身份。
function getUserLoginData(app_access_token, code) {
  return new Promise(resolve => {
    request.post({
      url: 'https://open.feishu.cn/open-apis/authen/v1/access_token',
      headers: { 'Content-Type': 'application/json' },
      body: {
        'app_access_token': app_access_token,
        'grant_type': 'authorization_code',
        'code': code
      },
      json: true
    }, (err,res, body) => {
      if (err) {
        return resolve(null);
      }
      if (typeof body === 'string') { body = JSON.parse(body); }
      let userLoginData = body.data
      resolve(userLoginData);
    });
  });
}

//获取用户信息（身份验证）
//此接口仅用于获取登录用户的信息。调用此接口需要在 Header 中带上 user_access_token。
function getUserInfo(user_access_token) {
  return new Promise(resolve => {
    request.get({
      url: 'https://open.feishu.cn/open-apis/authen/v1/user_info',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + user_access_token
      }
    }, (err,res, body) => {
      if (err) {
        console('获取用户信息失败');
        return resolve(null);
      }
      let userInfo = body.data;
      resolve(userInfo);
    });
  });
}

//获取通讯录授权范围
//该接口用于获取应用被授权可访问的通讯录范围，包括可访问的部门列表及用户列表。
function getScopeData(tenant_access_token) {
  return new Promise(async resolve => {
    request.get({
      url: 'https://open.feishu.cn/open-apis/contact/v1/scope/get',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tenant_access_token
      }
    }, (err,res, body) => {
      if (err) {
        console('获取通讯录授权范围范围失败');
        return resolve(null);
      }
      if (typeof body === 'string') { body = JSON.parse(body); }
      let scopeData = body.data;
      resolve(scopeData);
    });
  });
}

//批量获取用户信息
//该接口用于批量获取用户详细信息。
function getUserDatas(tenant_access_token, open_ids, employee_ids) {
  return new Promise(resolve => {
    let url = 'https://open.feishu.cn/open-apis/contact/v1/user/batch_get';
    let queryParamsStr = '';
    if (employee_ids && employee_ids.length > 0) {
      let query_employee_ids = employee_ids.map(id => 'employee_ids=' + id);
      queryParamsStr = query_employee_ids.join('&');
    }
    if (open_ids && open_ids.length > 0) {
      let query_open_ids = open_ids.map(id => 'open_ids=' + id);
      queryParamsStr = query_open_ids.join('&');
    }
    
    request.get({
      url: url + '?' + queryParamsStr,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tenant_access_token
      }
    }, (err,res, body) => {
      if (err) {
        console('批量获取用户详细信息失败');
        return resolve([]);
      }
      if (typeof body === 'string') { body = JSON.parse(body); }
      let userDatas = body.data.user_infos||[];
      resolve(userDatas);
    });
  });
}

//批量获取部门详情
//该接口用于批量获取部门详情，只返回权限范围内的部门。
function getDepartmentDatas(tenant_access_token, department_ids) {
  return new Promise(resolve => {
    let url = 'https://open.feishu.cn/open-apis/contact/v1/department/detail/batch_get';
    let queryParamsStr = '';
    if (department_ids && department_ids.length > 0) {
      let query_department_ids = department_ids.map(id => 'department_ids=' + id);
      queryParamsStr = query_department_ids.join('&');
      url += '?' + queryParamsStr;
    }
    
    request.get({
      url: url,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tenant_access_token
      }
    }, (err,res, body) => {
      if (err) {
        console('批量获取部门详细信息失败');
        return resolve([]);
      }
      if (typeof body === 'string') { body = JSON.parse(body); }
      let department_infos = body.data.department_infos||[];
      resolve(department_infos);
    });
  });
}

//该接口用于获取当前部门子部门列表
//调用该接口需要具有当前部门的授权范围。企业根部门 ID 为 0，
//当获取根部门子部门列表时，通讯录授权范围必须为全员权限
function getSub_departmentDatas(tenant_access_token, department_id) {
  return new Promise(resolve => {
    request.get({
      url: `https://open.feishu.cn/open-apis/contact/v1/department/simple/list?open_department_id=${department_id}&page_size=100&fetch_child=true`,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tenant_access_token
      }
    }, (err,res, body) => {
      if (err) {
        console('批量获取当前部门子部门列表失败');
        return resolve([]);
      }
      if (typeof body === 'string') { body = JSON.parse(body); }
      let department_infos = body.data.department_infos||[];
      resolve(department_infos);
    });
  });
}

//处理子部门数据，由于飞书的部门数据结构原因，采用递归处理
function getAllSub_departmentList(sub_departmentDatas) {
  let departmentList = [];

  for (let i = 0; i < sub_departmentDatas.length; i++) {
    let sub_departmentData = sub_departmentDatas[i];
    departmentList.push(sub_departmentData);
    let sub_departmentList = getAllSub_departmentList(sub_departmentData.department_infos||[]);
    departmentList = departmentList.concat(sub_departmentList);
  }

  return departmentList;
}

//获取该公司下的所有部门数据
function getAllDepartmentDatas(tenant_access_token) {
  return new Promise(async resolve => {
    let scopeData = await getScopeData(tenant_access_token);
    let allDepartmentDatas = [];
    //所有一级部门数据
    let departmentIds = scopeData.authed_open_departments||[];
    let departmentDatas = await getDepartmentDatas(tenant_access_token, departmentIds);
    allDepartmentDatas = allDepartmentDatas.concat(departmentDatas);

    //获取所有一级部门下的子部门列表
    for (let i = 0; i < departmentIds.length; i++) {
      let departmentId = departmentIds[i];
      let sub_departmentDatas =  await getSub_departmentDatas(tenant_access_token, departmentId);

      let allSub_departmentList = getAllSub_departmentList(sub_departmentDatas);
      let allSub_departmentIds = allSub_departmentList.map(dep => dep.open_department_id);
      let allSub_departmentDatas = await getDepartmentDatas(tenant_access_token, allSub_departmentIds);

      allDepartmentDatas = allDepartmentDatas.concat(allSub_departmentDatas);
    }

    resolve(allDepartmentDatas);
  });
}

//获取一级部门下的所有用户数据，包括子部门用户数据，
//若可递归的部门数量超过500个，接口将会返回错误Code 40162
function getAllUserDatasByDepartmentId(tenant_access_token, departmentId, page_token) {
  return new Promise(async resolve => {
    let url = `https://open.feishu.cn/open-apis/contact/v1/department/user/detail/list?open_department_id=${departmentId}&page_size=10&fetch_child=true`;
    if (page_token) {
      url += '&page_token=' + page_token;
    }
    let allUserDatas = [];
    request.get({
      url: url,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tenant_access_token
      }
    }, async (err,res, body) => {
      if (err) {
        console('批量获取用户详细信息失败');
        return resolve([]);
      }
      if (typeof body === 'string') { body = JSON.parse(body); }
      allUserDatas = allUserDatas.concat(body.data.user_infos||[]);
      if (body.data.page_token) {
        allUserDatas = allUserDatas.concat(await getAllUserDatasByDepartmentId(tenant_access_token, departmentId, body.data.page_token));
      }
      resolve(allUserDatas);
    });
  });
}

//查询应用管理员列表
//查询应用管理员列表，返回应用的最新10个管理员账户id列表。
function getAdminList(tenant_access_token) {
  return new Promise(resolve => {
    request.get({
      url: 'https://open.feishu.cn/open-apis/user/v4/app_admin_user/list',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tenant_access_token
      }
    }, (err,res, body) => {
      if (err) {
        console.log('获取应用管理员列表失败');
        return resolve([]);
      }
      body = JSON.parse(body);
      let adminList = body.data.user_list;
      resolve(adminList);
    });
  });
}

//批量发送消息
//给多个用户或者多个部门发送消息。
/**
 * 
 * @param {*} tenant_access_token 授权凭证
 * @param {*} userData 用户数据：department_ids, open_ids, user_ids
 * @param {*} msg_type 消息类型：文本text, 图片image, 富文本post, 群名片share_chat
 * @param {*} content 消息内容: text	{ "text": "要发送的文本消息" } ||	image	{ "image_key": "xxx-xxx-xxx-xxx-xxx" }	其中image key需要通过上传图片接口取得。|| post	{ "post":{ POST_CONTENT } }	post content格式请参见发送富文本消息。|| share_chat	"share_chat_id": "oc_xxx"
 */
function batchSendMessages(tenant_access_token, userData, msg_type, content) {
  return new Promise(resolve => {
    request.post({
      url: 'https://open.feishu.cn/open-apis/message/v4/batch_send/',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tenant_access_token
      },
      body: {
        ...userData,
        msg_type: msg_type,
        content: content
      },
      json: true
    }, (err,res, body) => {
      if (err) {
        return resolve(null);
      }
      if (typeof body === 'string') { body = JSON.parse(body); }
      let result = body.data;
      resolve(result);
    });
  });
}

//发送消息卡片
//给指定用户或者会话发送消息卡片，其中会话包括私聊会话和群会话。
/**
 * 
 * @param {*} tenant_access_token 授权凭证
 * @param {*} userData 用户数据：open_id, user_id, email, chat_id
 * @param {*} card 消息卡片的描述内容
 * @param {*} root_id （可选）需要回复的消息的open_message_id
 * @param {*} update_multi （可选）控制卡片是否是共享卡片(所有用户共享同一张消息卡片），默认为 false
 */
function sendMessageCard(tenant_access_token, userData, card, root_id, update_multi) {
  return new Promise(resolve => {
    let postBody = {
      ...userData,
      msg_type: 'interactive',
      card: card
    };
    if (root_id) { postBody.root_id = root_id; }
    if (update_multi) { postBody.update_multi = update_multi; }

    request.post({
      url: 'https://open.feishu.cn/open-apis/message/v4/send/',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tenant_access_token
      },
      body: postBody,
      json: true
    }, (err,res, body) => {
      if (err) {
        return resolve(null);
      }
      if (typeof body === 'string') { body = JSON.parse(body); }
      let result = body.data;
      resolve(result);
    });
  });
}

//查询订单详情，该接口用于查询某个订单的具体信息
function getOrder(order_id, tenant_access_token) {
  return new Promise(resolve => {
    request.get({
      url: 'https://open.feishu.cn/open-apis/pay/v1/order/get?order_id=' + order_id,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tenant_access_token
      }
    }, (err, res, body) => {
      if (err) {
        return resolve(null);
      }
      if (typeof body === 'string') {
        body = JSON.parse(body);
      }
      let order = body.data.order;
      resolve(order);
    });
  });
}

//查询租户购买的付费方案
//该接口用于分页查询应用租户下的已付费订单，每次购买对应一个唯一的订单，
//订单会记录购买的套餐的相关信息，业务方需要自行处理套餐的有效期和付费方案的升级
const page_size = 100;
function getOrderList(tenant_access_token, tenant_key, page_token) {
  return new Promise(async resolve => {
    let url = `https://open.feishu.cn/open-apis/pay/v1/order/list?status=all&page_size=${page_size}&tenant_key=${tenant_key}`;
    if (page_token) {
      url += `&page_token=${page_token}`;
    }

    request.get({
      url: url,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tenant_access_token
      }
    }, (err, res, body) => {
      if (err) {
        return resolve([]);
      }
      if (typeof body === 'string') {
        body = JSON.parse(body);
      }
      
      let orderList = body.data.order_list;
      resolve(orderList);
    });
  });
}

//获取某个用户是否有应用管理权限
//该接口用于查询用户是否为应用管理员，需要申请校验用户是否为应用管理员权限。
function getIs_app_admin(tenant_access_token, open_id) {
  return new Promise(async resolve => {
    request.get({
      url: `https://open.feishu.cn/open-apis/application/v3/is_user_admin?open_id=${open_id}`,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tenant_access_token
      }
    }, (err, res, body) => {
      if (err) {
        return resolve(false);
      }
      if (typeof body === 'string') {
        body = JSON.parse(body);
      }
      
      let is_app_admin = body.data.is_app_admin;
      resolve(is_app_admin);
    });
  });
}

module.exports = {
  requestResendApp_ticket,
  getApp_access_token,
  getTenant_access_token,
  getOrder,
  getUserLoginData,
  getUserInfo,
  getAdminList,
  batchSendMessages,
  sendMessageCard,
  getUserDatas,
  getScopeData,
  getDepartmentDatas,
  getSub_departmentDatas,
  getAllDepartmentDatas,
  getAllUserDatasByDepartmentId,
  getOrderList,
  getIs_app_admin
}