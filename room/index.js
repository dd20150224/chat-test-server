const { Socket } = require('socket.io');
const { Room } = require('../models/room');
const { Message } = require('../models/message');

const {
  leaveCurrentRoom,
  joinRoom,
  getSocketUserId,
  extracttOnlineUserSockets,
  checkUser,
  checkUserRoom,
  findUserRooms,
  findGroupRooms,
  getRoom,
  getRoomUserIds,
  getUser,
  getUserNewMessagesInfo,
  getRoomMessages,
  saveRoom,
  incrementUsersNewMessageCount,
  getMessageCountFromUser,
  getActiveUserIds,
  resetNewMessageCount,
  getAnotherRoomUser,
  isUserOnline
} = require('./helpers')
const e = require('express');

let clients = []
let rooms = []

const logClients = () => {
  clients.forEach((client) => {
    console.log(
      'logClients: CLIENTS Socket#' + client.socket.id + ' (User #' + client.userId + ')'
    )
  })
}

const logRooms = async () => {
  const rooms = await Room.find().lean();
  rooms.forEach(room => {
    console.log('logRooms: ROOM #' + room._id + ': OWNER (' + room.ownerId + ') USERS: (' +
      room.userIds.join(', ') + ')');
  })
}

const roomHandler = (io, socket) => {
  clients.push({
    socket,
    userId: '',
    roomId: '',
  })
  console.log(
    `Client connected: ${socket.id}   // total client = ${clients.length}`
  )

  const broadcastUserStatus = async (payload) => {
    const senderId = payload.userId
    console.log('broadcastUserStatus senderId = ' + senderId)
    const otherClients = clients.filter(client => (client.userId !== '' && client.userId !== senderId));
    otherClients.forEach(async(client) => {
      console.log(' forEach client.userId = ' + client.userId);
      console.log(' forEach senderId = ' + senderId);
      const newMessageCount = await getMessageCountFromUser(client.userId, senderId);      
      client.socket.emit('user-status-update', {
        ...payload,
        newMessageCount,
      })
    });
  }

  const returnUsersStatus = async () => {
    const activeUserIds = getActiveUserIds(clients);
    // clients
    //   .filter((client) => client.userId !== '')
    //   .map((client) => client.userId)
    const userId = await getSocketUserId(socket, clients);
    console.log('get user new messages info : userId = ' + userId);
    const newMessagesInfo = await getUserNewMessagesInfo(userId);
    socket.emit('users-status', { userIds: activeUserIds, newMessagesInfo })
  }

  const returnRoomsStatus = async () => {
    const userId = await getSocketUserId(socket, clients)
    if (userId) {
      // console.log('returnRoomsStatus: userId = ' + userId);
      const userRooms = await findUserRooms(userId)
      console.log('returnRoomsStatus: userRooms.length = ' + userRooms.length)

      const groupRooms = await findGroupRooms(userId)
      console.log('returnRoomsStatus: groupRooms.length = ' + groupRooms.length)

      // console.log('groupRooms: ', groupRooms);
      const rooms = [...userRooms, ...groupRooms]

      // console.log('returnRoomsStatus: rooms: ', rooms);
      socket.emit('rooms-status', { rooms })
    }
  }

  const emitRoomStatusByUserIds = async (userIds, room) => {
    const userIdSet = new Set(userIds)
    console.log('emitRoomStatusByUserIds: userIdSet: ', userIdSet);
    if (room.ownerId) userIdSet.add(room.ownerId)
    console.log('emitRoomStatusByUserIds: userIdSet: ', userIdSet)
    const allUserIds = Array.from(userIdSet)
    console.log('emitRoomStatusByUserIds: allUserIds: ', allUserIds)
    const sockets = await extracttOnlineUserSockets(clients, allUserIds)
    console.log('emitRoomStatusByUserIds: sockets.length = ' + sockets.length);
    sockets.forEach(socket => {
      socket.emit('room-status', {room});
    })
  }

  const emitRoomsStatusByUserIds = async (userIds, room) => {
    const userIdSet = new Set(userIds);
    if (room.ownerId) userIdSet.add(room.ownerId)
    const allUserIds = Array.from(userIdSet)
    const sockets = await extracttOnlineUserSockets(clients, allUserIds);
    console.log('emitRoomsStatusByUserIds sockets.length = ' + sockets.length);
    for (let i = 0; i < sockets.length; i++) {
      const loopSocket = sockets[i];
      const userId = await getSocketUserId(loopSocket, clients);
      const relatedRooms = await findGroupRooms(userId);
      console.log(`i=${i}: userid = ${userId}  rooms.length=${relatedRooms.length}`);
      loopSocket.emit('rooms-status', { rooms: relatedRooms });
    }
    // socket.join(room.id);
    // const userId = await getSocketUserId(socket, clients);
    // const relatedRooms = await findGroupRooms(userId);
    // logClients();
    // logRooms();
    // socket.emit('rooms-status', { rooms: relatedRooms });
  }

  socket.on('get-users-status', (data) => {
    const activeUserIds = clients.filter(client => client.userId !== '').map(client => client.userId);
    socket.emit('users-status', {userIds: activeUserIds});
  });

  socket.on('reset-room-new-message-count', async (data) => {
    const room = await getRoom(data.roomId);
    const userId = await getSocketUserId(socket, clients);
    console.log('reset-room-new-message-count: data.userId = ' + data.userId);
    console.log('reset-room-new-message-count: data.roomId = ' + data.roomId);

    const updated = await resetNewMessageCount(data.userId, room);
    console.log('updated: ' + (updated ? 'yes' : 'no'));
    if (updated) {
      if (room.ownerId === '') {
        // user
        const targetUserId = await getAnotherRoomUser(room, userId);
        const isOn = isUserOnline(targetUserId, clients);
        console.log('targetUserId = ' + targetUserId);
        console.log('isOn = ' + isOn);

        socket.emit('user-status-update', {
          isOn,
          userId: targetUserId,
          newMessages: 0
        });
      } else {        
        // room
        // 
        // pending
      }
    }    
  });

  socket.on('connect-user', async (data) => {
    // data = {
    //   userId,
    //   displayName
    // }
    const i = clients.findIndex((client) => client.socket.id === socket.id)
    console.log('connect-user find client i=' + i)

    if (i >= 0) {
      await checkUser(data);
      const oldUserId = clients[i].userId
      if (oldUserId !== '') {
        console.log('socket: old user id #' + oldUserId);
        await broadcastUserStatus({ isOn: false, userId: oldUserId });
        
        // socket.broadcast.emit('user-status-update', {
        //   isOn: false,
        //   userId: oldUserId,
        // })
      }
      clients[i].userId = data.userId
      console.log('socket: updated user id #' + data.userId);
      // socket.broadcast.emit('user-status-update', {
      //   isOn: true,
      //   userId: data.userId,
      // })
    } else {
      console.log('no client connected!');
    }
    leaveCurrentRoom(socket, clients);
    socket.emit('leave-room');
    // logClients();
    // logRooms();

    await returnUsersStatus();
    await returnRoomsStatus();

    if (data.userId) {
      console.log('connect-user: data.userId = ' + data.userId);
      await broadcastUserStatus({ isOn: true, userId: data.userId });
    }

  })

  socket.on('enter-group-room', async ({roomId}) => {
    // socket: leave existing room
    leaveCurrentRoom(socket, clients);

    // socket: join room
    const room = await getRoom(roomId)
    joinRoom(socket, clients, roomId);

    // room messages
    const messages = await getRoomMessages(roomId);
    socket.emit('init-room', { room, messages })

  });

  socket.on('enter-user-room', async ({userIdPair}) => {
    // socket: leave existing room
    leaveCurrentRoom(socket, clients);

    // ssocket: join room
    const room = await checkUserRoom(userIdPair);
    console.log('found user room: room.id = ' + room.id);
    joinRoom(socket, clients, room.id);

    // room messages
    const messages = await getRoomMessages(room.id);
    socket.emit('init-room', {room, messages});
  });

  socket.on('join-room', (data) => {
    if (data.userId) {
      const userId = getSocketUserId(socket, clients);
      console.log('join-room userId = ' + userId);
      if (userId) {
        const room = checkUserRoom([userId, data.userId])
        console.log('join-room checkUserRoom: room: ', room);
        socket.join(room.id)
      }
    } else if (data.roomId) {
      socket.join(data.roomId);
      // joinGroupRoom(data.roomId)
    }
  })

  socket.on('save-room', async (data) => {
    const {room, removedUserIds, addedUserIds, updatedUserIds} = await saveRoom(data.room);

    // update room status (for updatedUserIds);
    console.log('update room status');
    console.log('updatedUserIds: ', updatedUserIds);
    await emitRoomStatusByUserIds(updatedUserIds, room);

    // update room list (for addedUserIds and removedUserIds)
    console.log('udpate room list');
    console.log('addedUserIds: ', addedUserIds)
    console.log('removedUserIds: ', removedUserIds)
    
    const allUserIds = [...addedUserIds, ...removedUserIds];
    await emitRoomsStatusByUserIds(allUserIds, room);
    
    // if (room.ownerId) allUserIds.push(room.ownerId);

    // const onlineSockets = await extracttOnlineUserSockets(clients, allUserIds);

    // console.log('this socket.id = ' + socket.id);
    // onlineSockets.forEach(onlineSocket => {
    //   console.log('   onlineSocket.id = ' + onlineSocket.id);
    //   onlineSocket.emit('room-status', { room })
    // })
    // socket.join(room.id);
    // const userId = await getSocketUserId(socket, clients);    
    // const relatedRooms = await findGroupRooms(userId);
    // logClients();
    // logRooms();
    // socket.emit('rooms-status', { rooms: relatedRooms });
  })

  socket.on('message', async (payload) => {
    console.log('on(message): payload: ', payload);
    // payload = {
    //   type: 'text',
    //   text: textMessage,
    //   roomId: (activeRoom as IRoom).id,
    //   senderId: (currentUser as IUser).id,
    // }

    // save message
    console.log(1);
    const message = new Message(payload);
    console.log(2)
    let newMessage = await message.save();
    console.log(3)
    let newMessageWithSender = await Message.findById(message._id)
      .populate({
        path: 'sender',
        select: 'displayName avatarUrl letterName'})
    
    // let sender = await getUser(newMessage.senderId);
    console.log(4)
    let flatMessage = null;
    console.log(5)
    if (newMessageWithSender) {
      flatMessage = newMessageWithSender.toJSON()
    console.log(6)
      flatMessage = {
        ...flatMessage,
        title: flatMessage.sender?.displayName,
        avatar: flatMessage.sender?.avatarUrl,
        letterItem: flatMessage.sender?.letterName,
      }
    console.log(7)
      delete flatMessage.sender
    }
    const socketUserId = await getSocketUserId(socket, clients);
    console.log('message socketUserId = ' + socketUserId);
    // update new message count
    const room = await getRoom(payload.roomId);
    const roomUserIdSet = new Set(room.userIds);
    console.log('message room: ', room);
    console.log('message roomUserIdSet: ', roomUserIdSet);

    roomUserIdSet.delete(socketUserId);

    if (roomUserIdSet.size > 0) {
      await incrementUsersNewMessageCount(roomUserIdSet, room, socketUserId);

      // broadcast message count
      const otherClients = clients.filter(client => roomUserIdSet.has(client.userId));
      otherClients.forEach(async(client) => {
        const newMessageCount = await getMessageCountFromUser(client.userId, socketUserId);
        client.socket.emit('user-status-update', {
          isOn: true,
          userId: socketUserId,
          newMessageCount
        })
      });
    }
    
    // broadcast message for active chat-room
    console.log('on(message) to room: ' + payload.roomId);
    console.log('flatMessage: ', flatMessage)
    io.to(payload.roomId).emit('message', { message: flatMessage })
  })

  socket.on('disconnect', async () => {
    console.log('disconnect: clients: ', clients.length);
    const i = clients.findIndex((client) => client.socket.id === socket.id);
    console.log('disconnect: i = ' + i);
    if (i >= 0) {
      const oldUserId = clients[i].userId
      clients.splice(i, 1);

      console.log('disconnect   oldUserId = ' + oldUserId);
      if (oldUserId !== '') {
        console.log('socket: old user id #' + oldUserId)
        await broadcastUserStatus({
          isOn: false,
          userId: oldUserId
        });
        // socket.broadcast.emit('user-status-update', {
        //   isOn: false,
        //   userId: oldUserId,
        // })
      }
      console.log(`User disconnected: total client = ${clients.length}`)
    } else {
      console.log('client of socket not found');
    }
  });
}

module.exports = {
  roomHandler
};
