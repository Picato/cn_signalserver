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

  TYPING: 'typing',

  //rely
  TRYING: '100',
  OK: '200',
  ACK: 'ack',
  BYE: 'bye',

  //connect type
  CHAT: 'chat',
  VIDEO: 'video',
  CALL: 'call',
  SDP: 'sdp',     //webrtc session description protocol

  //
  UPDATEUSERID: 'updateid',
  CALLOFF: 'calloff',
  PEERCALLOFF: 'peercalloff',
  PEEROWNERLEAVE: 'peerownerleave',
  CONEK: 'conek',
  BUSY: 'busy',

  //operator
  OPERATOR_LEAVE: 'operatorleave',
  OPERATER_JOIN: 'operatorjoin',

  //online visitor
  NUMBER_VISITOR: 'numbervisitor',
  VISITOR_JOIN: 'visitorjoin',
  VISITOR_LEAVE: 'visitorleave',
  VISITORS: 'visitors',
  OPERATERS: 'operators',
  UPDATE_VISITOR: 'updatevisitor', //update visitor info
  VISITOR_PAGE_CHANGE: 'visitorpagechange',
  VISITOR_ACCEPT: 'visitoraccept',
  OPERATOR_ACCEPT: 'operatoraccept',
  VISITOR_ONLINE: 'visitoronline',
  VISITOR_IDLE: 'visitoridle',
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
  TURNSERVER: 'turnservers',

  //chat
  VISITOR_NEW_CONVERSATION: 'vnewconversation',
  OPERATOR_NEW_CONVERSATION: 'onewconversation'
}
