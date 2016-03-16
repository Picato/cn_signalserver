/**
 * Created by tuan on 11/03/2016.
 * Defined all type of message
 */

module.exports = {
  INVITE: 'invite',
  INVITE_CHAT: 'chat',
  INVITE_CALL: 'call',

  MESSAGE: 'message',
  RINGING: 'ringing',
  ACCEPT: 'accept',
  DECLINE: 'decline',

  //info
  OPERATOR_SOCKET_ID: 'operatorid',

  //rely
  TRYING100: '100trying',
  RINGING180: '180ringing',
  OK200: '200OK',
  ACK: 'ack',
  BYE_FROM: 'byefrome',
  BYE_TO: 'byeto',

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
