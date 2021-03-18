//飞书消息处理库，处理飞书相关的消息推送，以及提供消息数据模型
const moment = require('moment');
const config = require('./config.json');
//数据库mock方法
const CRUD = {
  findAsync: () => { console.log('findAsync'); },
  removeAsync: () => { console.log('removeAsync'); },
  updateAsync: () => { console.log('updateAsync'); },
  insertAsync: () => { console.log('insertAsync'); }
};
const db = {
  'feishu_msg': CRUD
}

function getApplinkUrl(url) {
  return `https://applink.feishu.cn/client/web_app/open?appId=${config.app_id}&path=${url}`;
}

const HELP_DOC_URL = config.HELP_DOC_URL;
const ACCESS_URL = getApplinkUrl('/feishu/login');

function getMsgCardJSON(title, elements) {
  return {
    "config": {
      "wide_screen_mode": false, //是否根据屏幕宽度动态调整消息卡片宽度，默认true
      "enable_forward": false     //是否允许卡片被转发，默认true
    },
    "header": {
      "title": { "tag": "plain_text", "content": title }
    },
    "elements": elements
  };
}
//此为购买应用后发送给管理员的消息卡片
const MSG_ADMIN_WELCOME = getMsgCardJSON("欢迎使用XXXX应用", [
  { "tag": "div", "text": { "tag": "plain_text", "content": "欢迎语balabala..." } },
  { "tag": "div", "text": { "tag": "plain_text", "content": "有疑问请联系：xxxxxxx" } },
  { "tag": "action", "actions": [
      { "tag": "button", "type": "default", "text": { "tag": "lark_md", "content": "立即体验" }, "url": ACCESS_URL },
      { "tag": "button", "type": "default", "text": { "tag": "lark_md", "content": "查看帮助文档" }, "url": HELP_DOC_URL }
    ]
  },
  { "tag": "hr" },
  { "tag": "note", "elements": [ 
      { "tag": "plain_text", "content": "来自XXXX" }
    ]
  }
]);

//此为成为超级管理员的通知消息卡片
const MSG_ADMIN_CREATE = getMsgCardJSON("设置超级管理员结果", [
  { "tag": "div", "text": { "tag": "plain_text", "content": '您已成为超级管理员' } }
]);

const MSG_ADMIN_CREATE_ERROR = getMsgCardJSON("设置超级管理员结果", [
  { "tag": "div", "text": { "tag": "plain_text", "content": '设置失败：该企业已设置超级管理员' } }
]);

//此为员工用户账号开通的通知消息卡片
const MSG_USER_CREATE = getMsgCardJSON("账号开通通知", [
  { "tag": "div", "text": { "tag": "plain_text", "content": '您的账号已开通XXXX应用使用权限，你可以进入应用，立即体验～' } },
  { "tag": "action", "actions": [
      { "tag": "button", "type": "default", "text": { "tag": "lark_md", "content": "立即体验" }, "url": ACCESS_URL }
    ]
  }
]);

//此为员工用户账号开通的通知消息卡片，用户与机器人的会话未创建时发送
const MSG_USER_CREATE_WELCOME = getMsgCardJSON("账号开通通知", [
  { "tag": "div", "text": { "tag": "plain_text", "content": '您的账号已开通XXXX应用使用权限，在这里你可以XXXXXXX' } },
  { "tag": "div", "text": { "tag": "plain_text", "content": "回复关键词：我的任务、XXX、XXXX，来体验对应的功能" } },
  { "tag": "div", "text": { "tag": "plain_text", "content": "有问题联系：XXXXXX" } },
  { "tag": "action", "actions": [
      { "tag": "button", "type": "default", "text": { "tag": "lark_md", "content": "立即体验" }, "url": ACCESS_URL }
    ]
  }
]);

//此为付费方案变更的通知消息卡片
const MSG_ORDER_CHANGE = getMsgCardJSON("方案变更通知", [
  { "tag": "div", "text": { "tag": "plain_text", "content": '您的企业账户已更换新的付费方案，请重新登录授权并更新数据' } },
  { "tag": "action", "actions": [
      { "tag": "button", "type": "default", "text": { "tag": "lark_md", "content": "授权并更新" }, "url": ACCESS_URL }
    ]
  }
]);

//此为付费方案“升级购买”人数的通知消息卡片
const MSG_ORDER_UPGRADE = getMsgCardJSON("增购通知", [
  { "tag": "div", "text": { "tag": "plain_text", "content": '您的企业账户已增购成功，请重新登录授权并更新数据' } },
  { "tag": "action", "actions": [
      { "tag": "button", "type": "default", "text": { "tag": "lark_md", "content": "授权并更新" }, "url": ACCESS_URL }
    ]
  }
]);

//用户和机器人的会话首次被创建
//首次会话是用户了解应用的重要机会，你可以发送操作说明、配置地址来指导用户开始使用你的应用。
const MSG_CHAT_CREATE = getMsgCardJSON("欢迎使用XXXX应用", [
  { "tag": "div", "text": { "tag": "plain_text", "content": "在这里你可以XXXXXX" } },
  { "tag": "div", "text": { "tag": "plain_text", "content": "回复关键词：我的任务、XXXX、XXXXX，来体验对应的功能" } },
  { "tag": "div", "text": { "tag": "plain_text", "content": "有问题联系：XXXXXX" } },
  { "tag": "action", "actions": [
      { "tag": "button", "type": "default", "text": { "tag": "lark_md", "content": "立即体验" }, "url": ACCESS_URL }
    ]
  },
  { "tag": "hr" },
  { "tag": "note", "elements": [ 
      { "tag": "plain_text", "content": "来自XXXXX" }
    ]
  }
]);

//用户发送无法识别的消息时，收到的默认回复信息
const MSG_CHAT_UNIDENTIFIED = getMsgCardJSON("无法识别消息，你可以尝试以下语令", [
  { "tag": "div", "text": { "tag": "plain_text", "content": "回复关键词：我的任务、XXXX、XXXX、XXXX，来体验对应的功能" } },
  { "tag": "action", "actions": [
      { "tag": "button", "type": "default", "text": { "tag": "lark_md", "content": "进入应用" }, "url": ACCESS_URL },
      { "tag": "button", "type": "default", "text": { "tag": "lark_md", "content": "帮助文档" }, "url": HELP_DOC_URL }
    ]
  },
  { "tag": "hr" },
  { "tag": "note", "elements": [ 
      { "tag": "plain_text", "content": "来自XXXX" }
    ]
  }
]);

//@机器人时的回复消息
const MSG_REBORT_WELCOME = getMsgCardJSON("你好呀，我还不会群聊天呢",[
  { "tag": "div", "text": { 
      "tag": "lark_md", "content": "你可以点击[打开应用]($ACCESS_URL)，去看看有什么哦，若遇到问题请查询[帮助文档]($HELP_DOC_URL)",
      "href": {
          "ACCESS_URL": { "url": ACCESS_URL },
          "HELP_DOC_URL": { "url": HELP_DOC_URL }
      } 
  } },
  { "tag": "hr" },
  { "tag": "note", "elements": [ 
      { "tag": "plain_text", "content": "来自XXXX" }
    ]
  }
]);

//机器人进群时的欢迎消息
const MSG_REBORT_ADD = getMsgCardJSON("初次见面！请多关照", [
  { "tag": "div", "text": { "tag": "plain_text", "content": "欢迎使用XXXX，balabalabala～" } },
  { "tag": "div", "text": { "tag": "plain_text", "content": "有问题联系：XXXXXXX" } },
  { "tag": "action", "actions": [
      { "tag": "button", "type": "default", "text": { "tag": "lark_md", "content": "立即体验" }, "url": ACCESS_URL },
      { "tag": "button", "type": "default", "text": { "tag": "lark_md", "content": "查看帮助文档" }, "url": HELP_DOC_URL }
    ]
  },
  { "tag": "hr" },
  { "tag": "note", "elements": [ 
      { "tag": "plain_text", "content": "来自XXXX" }
    ]
  }
]);

function getWatchButton(title, url) {
  let watchUrl = getApplinkUrl(url);
  return getMsgCardJSON(title, [
    { "tag": "action", "actions": [
        { "tag": "button", "type": "default", "text": { "tag": "lark_md", "content": "查看详情" }, "url": watchUrl }
      ]
    }
  ]);
}

const MSG_CHAT_TASK = getWatchButton("我的任务", "/我的任务");

function addMsgData(data) {
  return new Promise(async resolve => {
    let id = data.open_message_id;
    await db.feishu_msg.insertAsync({ id: id, ...data });
    resolve('ok');
  });
}

function checkIsExistMsg(msgId) {
  return new Promise(async resolve => {
    let msg = (await db.feishu_msg.findAsync({ id: msgId }))[0];
    resolve(msg ? true : false);
  }); 
}

//设置超级管理员
function setSuperAdmin(tenant_access_token, userData) {
  return new Promise(async resolve => {
    //TODO

    resolve({ msg: 'ok' });
  });
}

module.exports = {
  MSG_REBORT_WELCOME,
  MSG_REBORT_ADD,
  MSG_ADMIN_WELCOME,
  MSG_ADMIN_CREATE,
  MSG_ADMIN_CREATE_ERROR,
  MSG_USER_CREATE,
  MSG_USER_CREATE_WELCOME,
  MSG_ORDER_CHANGE,
  MSG_ORDER_UPGRADE,
  MSG_CHAT_CREATE,
  MSG_CHAT_UNIDENTIFIED,
  MSG_CHAT_TASK,
  addMsgData, 
  checkIsExistMsg,
  setSuperAdmin
};