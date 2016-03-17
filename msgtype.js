/**
 * Created by tuan on 11/03/2016.
 * Defined all type of message
 */

module.exports = {
  INVITE: 'invite',
  INVITE_CHAT: 'chat',
  INVITE_CALL: 'call',

  MESSAGE: 'message',
  RINGING: '180',
  ACCEPT: 'accept',
  DECLINE: 'decline',

  //info
  OPERATOR_SOCKET_ID: 'operatorid',

  //rely
  TRYING: '100',
  OK: '200',
  ACK: 'ack',
  BYE: 'bye',

  //close
  DISCONNECT: 'disconnect',
  LEAVE: 'leave',

  //screen
  SHARESCREEN: 'shareScreen',
  UNSHARESCREEN: 'unshareScreen',

  //server
  STUNSERVER: 'stunservers',
  TURNSERVER: 'turnservers'
}
