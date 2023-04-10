const express = require('express');
const router = express.Router();

// controllers
const HomeController = require('./controllers/home.controller');
const RoomController = require('./controllers/room.controller');

router.get('/', HomeController.index);
router.get('/rooms', RoomController.index);

module.exports = router;
