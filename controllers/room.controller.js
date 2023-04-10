const { Room } = require('../models/room');

const RoomController = {
  index: async (req, res) => {
    const rows = await Room.find();
    return res.json({ result: rows });
  },
}

module.exports = RoomController
