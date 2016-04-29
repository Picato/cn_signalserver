/**
 * Created by tuan on 11/03/2016.
 * Defined all type of message
 */

module.exports = {
  //message header
  INVITE: 'invite',

  MESSAGE: 'message',
  RINGING: '180',
  ACCEPT: 'accept',
  DECLINE: 'decline',

  //rely
  TRYING: '100',
  OK: '200',
  ACK: 'ack',
  BYE: 'bye',

  //connect type
  CHAT: 'chat',
  VIDEO: 'video',
  CALL: 'call',

  //
  UPDATEUSERID: 'updateid',
  CALLOFF: 'calloff',
  PEERCALLOFF: 'peercalloff',
  PEEROWNERLEAVE: 'peerownerleave',

  //online visitor
  NUMBER_VISITOR: 'numbervisitor',
  VISITOR_JOIN: 'visitorjoin',
  VISITOR_LEAVE: 'visitorleave',

  //info
  OPERATOR_SOCKET_ID: 'operatorid',

  //close
  DISCONNECT: 'disconnect',
  LEAVE: 'leave',
  OWNERLEAVE: 'ownerleave',

  //screen
  SHARESCREEN: 'shareScreen',
  UNSHARESCREEN: 'unshareScreen',

  //server
  STUNSERVER: 'stunservers',
  TURNSERVER: 'turnservers'
}
