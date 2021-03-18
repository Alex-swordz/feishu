"user strict"

const msgFactory = require('./msgFactory');

module.exports = async (req, res) => {
  let data = req.body;
  if (data.encrypt) { //若消息内容加密，则需先解密
    //TODO
  }
  
  if (data.type === 'url_verification') { //若是验证请求，则不需要做后续操作
    return res.status(200).json({ challenge: data.challenge });
  }

  let { open_message_id, action } = data;
  //检查飞书的推送消息是否已推送过
  let isExistMsg = await msgFactory.checkIsExistMsg(open_message_id);
  if (isExistMsg) {
    console.log('Duplicate Msg:', data);
    return;
  }
};