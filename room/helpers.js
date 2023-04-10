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

const getSocketsByUserIds = async(clients, userIds) => {
  console.log('getSocketsByUserIds: userIds: ', userIds);
  console.log('getSocketsByUserIds: clients.length = ' + clients.length);
  const filteredClients = clients.filter(client => userIds.includes(client.userId))
  console.log('getSocketsByUserIds: filteredClients.length = ' + filteredClients.length);
  for (let i = 0; i < filteredClients.length; i++) {
    const loop = filteredClients[i];
    console.log(`i=${i}: userId = ${loop.userId}`);
  }
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

const getRoom = async (roomId) => {
  return await Room.findById(roomId);
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

const findUserRooms = async (userId) => {
  const userObjId = new Mongoose.Types.ObjectId(userId);

  // console.log('findUserRoom: userObjectIdPair: ', userObjectIdPair);
  let rooms = await Room.find({
    'name': '',
    'ownerId': '',
    'userIds': userObjId
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

module.exports = {
  leaveCurrentRoom,
  joinRoom,
  getSocketUserId,
  getSocketsByUserIds,
  checkUser,
  checkUserRoom,
  findGroupRooms,
  findUserRooms,
  getRoom,
  getUser,
  getRoomMessages,
  saveRoom,
};
