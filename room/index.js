const { Socket } = require('socket.io');
const { Room } = require('../models/room');
const { Message } = require('../models/message');

const {
  leaveCurrentRoom,
  joinRoom,
  getSocketUserId,
  getSocketsByUserIds,
  checkUser,
  checkUserRoom,
  findUserRooms,
  findGroupRooms,
  getRoom,
  getUser,
  getRoomMessages,
  saveRoom,
} = require('./helpers');

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

  const emitUsersStatus = async () => {
    const activeUserIds = clients
      .filter((client) => client.userId !== '')
      .map((client) => client.userId)
    socket.emit('users-status', { userIds: activeUserIds })
  }

  const emitRoomsStatus = async () => {
    const userId = await getSocketUserId(socket, clients)
    if (userId) {
      // console.log('emitRoomsStatus: userId = ' + userId);
      const userRooms = await findUserRooms(userId);
      const groupRooms = await findGroupRooms(userId);
      // console.log('groupRooms: ', groupRooms);
      const rooms = [...userRooms, ...groupRooms];

      console.log('emitRoomsStatus: rooms: ', rooms);
      socket.emit('rooms-status', { rooms });
    }
  }

  socket.on('get-users-status', (data) => {
    const activeUserIds = clients.filter(client => client.userId !== '').map(client => client.userId);
    socket.emit('users-status', {userIds: activeUserIds});
  })

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
        socket.broadcast.emit('user-status-update', {
          isOn: false,
          userId: oldUserId,
        })
      }
      clients[i].userId = data.userId
      console.log('socket: updated user id #' + data.userId);
      socket.broadcast.emit('user-status-update', {
        isOn: true,
        userId: data.userId,
      })
    } else {
      console.log('no client connected!');
    }
    leaveCurrentRoom(socket, clients);
    socket.emit('leave-room');
    logClients();
    logRooms();
    emitUsersStatus();
    emitRoomsStatus();
  })

  socket.on('enter-group-room', async ({roomId}) => {
    // socket: leave existing room
    leaveCurrentRoom(socket, clients);

    // socket: join room
    const room = await getRoom(roomId)
    joinRoom(socket, clients, roomId);

    // room messages
    const messages = await getRoomMessages(roomId);
    // console.log('enter-group-room: messages: ', messages);
    socket.emit('init-room', { room, messages })

    // console.log('enter-group-room: roomId = ' + roomId);
    // console.log('socket.rooms: ', socket.rooms);
    // for (let i = 0; i < socket.rooms.length; i++) {
    //   const loopRoom = socket.rooms[i];
    //   console.log(`i=${i}: loopRoom: ${loopRoom}`);
    // }
  });

  socket.on('enter-user-room', async ({userIdPair}) => {
    // socket: leave existing room
    leaveCurrentRoom(socket, clients);

    // ssocket: join room
    const room = await checkUserRoom(userIdPair);
    console.log('found user room: room.id = ' + room.id);
    joinRoom(socket, clients, room.id);

    // room messages
    const messages = getRoomMessages(room.id);
    socket.emit('init-room', {room, messages});
    // console.log('enter-user-room: userIdPair: ', userIdPair);    
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
    const room = await saveRoom(data.room);
    const allUserIds = [...room.userIds];
    if (room.ownerId) allUserIds.push(room.ownerId);

    const onlineSockets = await getSocketsByUserIds(clients, allUserIds);

    console.log('this socket.id = ' + socket.id);
    onlineSockets.forEach(onlineSocket => {
      console.log('   onlineSocket.id = ' + onlineSocket.id);
      onlineSocket.emit('room-status', { room })
    })
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
    const message = new Message(payload);
    let newMessage = await message.save();
    let newMessageWithSender = await Message.findById(message._id)
      .populate({
        path: 'sender',
        select: 'displayName avatarUrl letterName'})
    
    // let sender = await getUser(newMessage.senderId);
    let flatMessage = null;
    if (newMessageWithSender) {
      flatMessage = newMessageWithSender.toJSON()
      flatMessage = {
        ...flatMessage,
        title: flatMessage.sender?.displayName,
        avatar: flatMessage.sender?.avatarUrl,
        letterItem: flatMessage.sender?.letterName,
      }
      delete flatMessage.sender
    }
    // braodcast message count


    // broadcast message for active chat-room
    console.log('on(message) to room: ' + payload.roomId);
    console.log('flatMessage: ', flatMessage)
    io.to(payload.roomId).emit('message', { message: flatMessage })
  })

  socket.on('disconnect', () => {
    console.log('disconnect: clients: ', clients.length);
    const i = clients.findIndex((client) => client.socket.id === socket.id);
    if (i >= 0) {
      const oldUserId = clients[i].userId
      clients.splice(i, 1);

      if (oldUserId !== '') {
        console.log('socket: old user id #' + oldUserId)
        socket.broadcast.emit('user-status-update', {
          isOn: false,
          userId: oldUserId,
        })
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
