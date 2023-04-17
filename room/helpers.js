const Mongoose = require('mongoose');
const { User } = require('../models/user');
const { Room } = require('../models/room');
const { Message } = require('../models/message');

const leaveCurrentRoom = (socket, clients) => {
  const i = clients.findIndex((client) => client.socket.id === socket.id);
  if (i >= 0) {
    const roomId = clients[i].roomId;
    if (roomId) {
      clients[i].roomId = ''
      socket.leave(roomId);
    }
  }
}

const joinRoom = (socket, clients, roomId) => {
  const i = clients.findIndex((client) => client.socket.id === socket.id)
  if (i >= 0) {
    clients[i].roomId = roomId
    socket.join(roomId)
  }
}

const extracttOnlineUserSockets = async(clients, userIds) => {
  if (!Array.isArray(userIds)) {
    userIds = userIds.toArray();
  }
  console.log('extracttOnlineUserSockets: userIds: ', userIds);
  console.log('extracttOnlineUserSockets: clients.length = ' + clients.length);
  const filteredClients = clients.filter(client => userIds.includes(client.userId))
  console.log('extracttOnlineUserSockets: filteredClients.length = ' + filteredClients.length);
  // for (let i = 0; i < filteredClients.length; i++) {
  //   const loop = filteredClients[i];
  //   console.log(`i=${i}: userId = ${loop.userId}`);
  // }
  const sockets = filteredClients.map((client) => client.socket)
  return sockets;
}

const getSocketUserId = async (socket, clients) => {
  // console.log('getSocketUserId socket.id = ' + socket.id);
  // clients.forEach(client => {
  //   console.log('client.socket.id = ' + client.socket.id);
  // })
  const i = clients.findIndex((client) => client.socket.id === socket.id);
  console.log('getSocketUserId i = ' + i);
  return (i >= 0) ? clients[i].userId : '';
}

const getUser = async (userId) => {
  return await User.findOne({appUserId: userId});
}

const getUserNewMessagesInfo = async (userId) => {
  const user = await User.findOne({appUserId: userId});
  return user?.newMessages || [];
}

const resetNewMessageCount = async (userId, room) => {
  const isGroupRoom = room.ownerId !== '';
  console.log('resetNewMessageCount: isGroupRoom = ' + (isGroupRoom ? 'yes' : 'no'));
  console.log('resetNewMessageCount: userId = ' + userId);
  const user = await User.findOne({appUserId: userId}).lean();
  const newMessages = user.newMessages; 
  console.log('resetNewMessageCount: newMessages: ', newMessages);
  if (newMessages && newMessages.length>0) {
    console.log('newMessages>0');
    if (isGroupRoom) {
      return await resetNewMessageCountRoom(userId, room, newMessages);
    } else {
      console.log('room.userIds: ', room.userIds);
      const userIdSet = new Set(room.userIds);
      userIdSet.delete(userId);
      console.log('userIdset: ', userIdSet)
      const [targetUserId] = userIdSet;
      console.log('targetUserId = ' + targetUserId);
      return await resetNewMessageCountUser(userId, targetUserId, newMessages);
    }
  }
  return false;
}

const resetNewMessageCountRoom = async (userId, room, newMessages) => {
  const i = newMessages.findIndex(item => (item.id === room.id && item.type === 'room'));
  if (i >= 0) {
    newMessages[i].count = 0;
    await User.updateOne(
      { appUserId: userId }, 
      {
        $set: {newMessages}
      }
    );
    return true;
  }
  return false;
}

const resetNewMessageCountUser = async (userId, targetUserId, newMessages) => {
  const i = newMessages.findIndex(item => (item.id === targetUserId && item.type === 'user'))
  if (i >= 0) {
    newMessages[i].count = 0
    await User.updateOne(
      { appUserId: userId },
      {
        $set: { newMessages },
      }
    );
    return true;
  }
  return false;
}

const getMessageCountFromUser = async (userId, senderId) => {
  const user = await User.findOne({appUserId: userId});
  let result = 0;
  if (user?.newMessages) {
    const messageInfo = user.newMessages.find(item => (item.type==='user' && item.id===senderId));
    if (messageInfo) result = messageInfo.count;
  }
  return result;
}

const getRoom = async (roomId) => {
  return await Room.findById(roomId);
}

const getRoomUserIds = async (roomId) => {
  const room = await getRoom(roomId);
  return room ? new Set(room.userIds) : new Set();
}

const getRoomMessages = async (roomId) => {
  console.log('getRoomMessages of room #' + roomId);
  let messages = await Message.find({roomId})
    .populate({
      path: 'sender',
      select: 'displayName avatarUrl letterName'
    })
    .sort({createdAt: 1});
  
  messages = messages.map(message => {
    let flatMessage = message.toJSON();
    flatMessage = {
      ...flatMessage,
      title: flatMessage.sender?.displayName,
      avatar: flatMessage.sender?.avatarUrl,
      letterItem: flatMessage.sender?.letterName,
    }
    delete flatMessage.sender
    return flatMessage
  })

  console.log('getRoomMessages messages: ' + messages.length);
  return messages;
}
const checkUserRoom = async (userIds) => {
  const userObjectIdPair = userIds.map((id) => new Mongoose.Types.ObjectId(id))

  console.log('findUserRoom: userObjectIdPair: ', userObjectIdPair)
  let room = await Room.findOne({
    'name': '',
    'ownerId': '',
    'userIds.2': { $exists: false },
    userIds: { $all: userObjectIdPair },
  });
  if (!room) {
    const newRoom = new Room({
      name: '',
      ownerId: '',
      userIds: userObjectIdPair,
    })
    room = await newRoom.save()
    console.log('checkUserRoom: created room: ', room);
  }
  return room
}
const checkUser = async ({userId, displayName, firstName, lastName, avatarUrl}) => {
  console.log('checkUser: userId = ' + userId);
  console.log('checkUser: displayName = ' + displayName)
  console.log('checkUser: firstName = ' + firstName)
  console.log('checkUser: lastName = ' + lastName)
  const user = await User.findOne({appUserId: userId}).lean();
  const letterName = `${firstName?firstName[0]:''}${lastName?lastName[0]:''}`;
  if (user) {
    console.log('  exists');
    await User.updateOne({appUserId: userId}, {
      $set: {
        displayName,
        letterName,
        avatarUrl,
      }
    });
  } else {
    console.log('   not exists => create');
    const newUser = new User({
      appUserId: userId,
      displayName,
      letterName,
      avatarUrl,
      newMessages: []
    })
    await newUser.save();
  }
}

const incrementUsersNewMessageCount = async(roomUserIdSet, room, senderId) => {
  const type = room.ownerId === '' ? 'user' : 'room';
  console.log('incrementUsersNewMessageCount  type = ' + type);
  if (type === 'room') {
    await incrementUsersNewMessageCountForRoom(roomUserIdSet, room);    
  } else {
    await incrementUsersNewMessageCountForUser(roomUserIdSet, senderId);    
  }
}

const incrementUsersNewMessageCountForRoom = async (userIdset, room) => {
  for (userId of userIdset) {
    // const userhhh = new Mongoose.Types.ObjectId(userId);
    const user = await User.find({appUserId: userId}, {newMessages: 1}).lean();
    let newMessages = user.newMessages;
    if (newMessages) {
      const index = newMessages.find(item => (item.id === room.id && item.type === 'room'));
      if (index >= 0) {
        newMessages[index].count++;
      } else {
        newMessages.push({
          type: 'room',
          id: room.id,
          count: 1,
        })
      }
    } else {
      newMessages = [{
        type: 'room',
        id: room.id,
        count: 1,
      }];
    }
    await User.updateOne({_id: userObjId},
      {
        $set: {newMessages}
      }
    );
  } 
}

const incrementUsersNewMessageCountForUser = async (userIdSet, senderId) => {
  console.log('incrementUsersNewMessageCountForUser  userIdSet: ', userIdSet);
  console.log('incrementUsersNewMessageCountForUser  senderId: ', senderId)

  for (userId of userIdSet) {
    console.log('incrementUsersNewMessageCountForUser userId = ' + userId);
    const user = await User.findOne({appUserId: userId}, {newMessages: 1}).lean();
    console.log('incrementUsersNewMessageCountForUser user: ', user);

    let newMessages = user.newMessages;
    console.log('newMessages: ', newMessages);
    if (newMessages) {
      console.log('newMessages: ', newMessages);
      const index = newMessages.findIndex(item => (item.id === senderId && item.type === 'user'))      
      console.log('incrementUsersNewMessageCountForUser  index = ' + index);
      if (index >= 0) {
        newMessages[index].count++;
      } else {
        newMessages.push({
          type: 'user',
          id: senderId,
          count: 1,
        })
      }       
    } else {
      newMessages = [{
        type: 'user',
        id: senderId,
        count: 1,
      }]
    }
    console.log(`add message count  user #${userId}: message: `, newMessages);
    await User.updateOne({appUserId: userId},
      {
        $set: {newMessages}
      }
    );
  }
}

const findUserRooms = async (userId) => {
  // const userObjId = new Mongoose.Types.ObjectId(userId);

  // console.log('findUserRoom: userObjectIdPair: ', userObjectIdPair);
  let rooms = await Room.find({
    'name': '',
    'ownerId': '',
    'userIds': userId
  }).lean();
  rooms = rooms.map(room => {
    return {
      ...room,
      id: room._id.toString()
    }
  })
  // console.log('findUserRooms: rooms: ', rooms);
  return rooms;
}

const findGroupRooms = async (userId) => {
  // console.log('findGroupRooms: userId = ' + userId)
  let rooms = await Room.find({
    $and: [
      {
        ownerId: {$ne: '' },
      },
      {
        $or: [{ ownerId: userId }, { userIds: userId }],
      },
    ],
  }).lean();
  rooms = rooms.map(room => {
    return {
      ...room,
      id: room._id.toString()
    }
  });
  // console.log('getGroupRooms: rooms: ', rooms);
  // rooms.map((room) => {
  //   room.id = room._id.toString()
  // })
    // console.log('findGroupRooms: rooms: ', rooms)
  for (let i = 0; i < rooms.length; i++) {
    const loopRoom = rooms[i];
    console.log(`Room ${loopRoom.name}: users: ${loopRoom.userIds.length}`)    
  }

  return rooms
}

const saveRoom = async (room) => {
  let addedUserIds = [];
  let removedUserIds = [];
  let updatedUserIds = [];
  console.log('saveRoom: room: ', room);
  console.log('saveRoom: room.id: ' + (room.id ? 'yes' : 'no'));
  let roomObjId = null;
  if (room.id) {
    console.log('saveRoom: exists room.id = ' + room.id);
    roomObjId = new Mongoose.Types.ObjectId(room.id)
    const oldRoom = await Room.findById(roomObjId).lean();

    const oldUserIds = oldRoom.userIds;
    const newUserIds = room.userIds;

    addedUserIds = newUserIds.filter( userId => !oldUserIds.includes(userId));
    removedUserIds = oldUserIds.filter( userId => !newUserIds.includes(userId));
    updatedUserIds = newUserIds.filter( userId => oldUserIds.includes(userId));

    const updatedData = {
      ownerId: room.ownerId,
      name: room.name,
      userIds: room.userIds
    }
    await Room.updateOne({_id: roomObjId}, updatedData);
  } else {
    delete room.id;
    console.log('saveRoom: no id');
    try {
      addedUserIds = room.userIds
      const newRoom = new Room({
        ownerId: room.ownerId,
        name: room.name,
        userIds: room.userIds
      });
      console.log('newRoom: ', newRoom)      
      const result = await newRoom.save()
      roomObjId = result._id;
      console.log('saveRoom after save: result: ', result);
    } catch(err) {
      console.log('err: ', err);
      throw (err);
    }
  }
  const addedRoom = await Room.findById(roomObjId);
  // console.log('saveRoom result: ', result);
  // console.log('saveRoom result.id = ' + result.id);
  return {
    addedUserIds,
    removedUserIds,
    updatedUserIds,
    room: addedRoom
  };
}

const getActiveUserIds = (clients) => {
  return clients
    .filter((client) => client.userId !== '')
    .map((client) => client.userId)
}

const getAnotherRoomUser = async (room, userId) => {
  const userIds = new Set(room.userIds)
  userIds.delete(userId)
  const [anotherUserId] = userIds
  return anotherUserId
}

const isUserOnline = (userId, clients) => {  
  console.log('isUserOnline userId = ' + userId);
  const client = clients.find(client => client.userId === userId);
  console.log('isUserOnline: client: ', client);
  return client !== null && client !== undefined;
}

module.exports = {
  leaveCurrentRoom,
  joinRoom,
  getSocketUserId,
  extracttOnlineUserSockets,
  checkUser,
  checkUserRoom,
  findGroupRooms,
  findUserRooms,
  getRoom,
  getRoomUserIds,
  getUser,
  getUserNewMessagesInfo,
  getMessageCountFromUser,
  getRoomMessages,
  saveRoom,
  incrementUsersNewMessageCount,
  getActiveUserIds,
  resetNewMessageCount,
  getAnotherRoomUser,
  isUserOnline,
}
