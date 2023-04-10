const mongoose = require('mongoose');
const { Schema } = mongoose;

const roomSchema = new Schema(
  {
    ownerId: String,
    name: String,
    userIds: [String],
  },
  {
    timestamps: true,
    collection: 'rooms',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

roomSchema.virtual('id').get(function () {
  return this._id.toString();
})

const Room = mongoose.model('Room', roomSchema)
module.exports = {
  Room
};
