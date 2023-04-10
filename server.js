const {config} = require('dotenv');
config()

const mongoose = require('mongoose');
const express = require('express');
const app = express();
const routes = require('./routes');

const { roomHandler } = require('./room');

// database connection
mongoose.connection.on('error', (err) => {
  console.log('err: ', err);
});
const options = {
  autoIndex: false, // Don't build indexes
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 
  family: 4, // Use IPv4, skip trying IPv6
}
mongoose.connect(process.env.CONNECTION_STR, options).then(() => {
  console.log('DB connection successful!');
}).catch(error => console.log('connection error: ', error));

const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

app.use(cors());
app.use(routes);

const server = http.createServer(app);

const joinRoomSingle = (userIdPair) => {
  const room = getRoomSingle(dualUserIds);
  if (room) {
    rooms.push({
      id: room.id,
      userIds: room.userIds
    })
  } else {
    room = createRoom({
      name: '',
      userIds: UserIdPair,
    });
    rooms.push(room);
  }
  return room;
}

// console.log('Origin: ' + process.env.ORIGIN);
const io = new Server(server, {
  cors: {
    origin: '*', // process.env.ORIGIN,
    methods: ['GET', 'POST'],
  },
})

io.on('connection', (socket) => {
  roomHandler(io, socket);
  socket.on('discosnnect', () => {
    console.log('Client disconnected.');
  })
})


const port = process.env.SOCKET_PORT || 3001;
server.listen(port, () => {
  console.log('Server is running on port: ' + port);
});