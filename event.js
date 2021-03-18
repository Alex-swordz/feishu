"user strict"

const config = require('./config.json');
//token:保证事件的来源确实是飞书开放平台
const Verification_Token = config.Verification_Token;
const eventFactory = require('./eventFactory');

module.exports = async (req,res) => {
  let data = req.body;
  if (data.encrypt) { //若消息内容加密，则需先解密
    //TODO
  }

  //有header代表新版，从header中取token
  let { challenge, token, type, header, schema } = data;
  if (header) { token = header.token; }

  if (token !== Verification_Token) {  //请求来自于其他平台，阻断后续操作
    return res.status(401).json({ msg: 'Invalid Token' });
  }
  if (type === 'url_verification') { //若是验证请求，则不需要做后续操作
    return res.status(200).json({ challenge: challenge });
  }

  //若是事件推送或新版2.0订阅事件推送，则先返回http 200响应该请求，再做后续操作
  if (type === 'event_callback' || schema === '2.0') {
    res.status(200).end();
  }

  let { event } = data;
  //检查飞书的推送事件是否已推送过
  let event_id = data.uuid;
  if (schema === '2.0') { event_id = header.event_id; }
  let isExistEvent = await eventFactory.checkIsExistEvent(event_id);
  if (isExistEvent) {
    console.log('Duplicate Event:', data);
    return;
  }
  //检查是否有此事件的处理
  let eventType = event.type;
  if (header) { eventType = header.event_type; }
  if (!eventFactory.TYPE_EVENT_LIST.includes(eventType)) {
    console.log('No This Event Proc essor:', data);
    return;
  }
  //存储飞书的推送事件存储起来
  //开放平台会每隔1小时推送一次 app_ticket ，应用通过该 app_ticket 获取 app_access_token，所以没必要存储app_ticket事件
  if (eventType !== 'app_ticket') {
    await eventFactory.addEventData(data);
  }
  
  //响应请求后处理订阅事件
  await eventFactory.TYPE_EVENT_MAPPING[eventType](data);
};