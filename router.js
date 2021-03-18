
const router = require('express').Router();
const requestFactory = require('./requestFactory');
const eventFactory = require('./eventFactory');
const msgFactory = require('./msgFactory');
const baseObject = require('../../lib/baseObject');
const db = new baseObject(["feishu_event", "company", "user", "feishu_user", "portalUser", "department", "stay"]);
const config = require('./config.json');
const utils = require('../../utils/utils');
const dataFactory = require('../../utils/dataFactory');

//订阅事件接口
router.post('/event', require('./event.js')); 

//消息接口
router.post('/msg', require('./msg.js'));

//飞书平台进入XXXX应用入口
//请求身份验证,获取登录预授权码 code
const REDIRECT_URI = config.ACCESS_URL;
router.get('/login', async (req, res) => {
  //跳转到指定路由
  let { code, state } = req.query;
  if (!code) {  //无授权code，跳转到飞书授权页面
    return res.redirect(`https://open.feishu.cn/open-apis/authen/v1/index?redirect_uri=${encodeURIComponent(REDIRECT_URI)}&app_id=${config.app_id}&state=${state||''}`);
  }

  let app_access_token = await eventFactory.getLocalApp_access_token();
  //授权code登录
  let loginUser = await requestFactory.getUserLoginData(app_access_token, code);

  //TODO
});

router.post('/admin', async (req, res) => {
  //TODO

  //处理生成超级管理员
  let app_access_token = await eventFactory.getLocalApp_access_token();
  let tenant_access_token = await requestFactory.getTenant_access_token(app_access_token, companyid);
  let result = await msgFactory.setSuperAdmin(tenant_access_token, userData);

  if (result.msg === 'ok') {
    //给飞书用户发送绑定超级管理员成功的消息卡片
    await requestFactory.sendMessageCard(tenant_access_token, { open_id: userData.open_id }, msgFactory.MSG_ADMIN_CREATE);
  } else {
    //失败消息卡片
    await requestFactory.sendMessageCard(tenant_access_token, { open_id: userData.open_id }, msgFactory.MSG_ADMIN_CREATE_ERROR);
  }

  res.status(200).end();
});

//初始化飞书用户数据
router.post('/initData', async (req, res) => {
  let companyid = '';

  await eventFactory.initUserData(companyid);

  res.status(200).end();
});

module.exports = router;