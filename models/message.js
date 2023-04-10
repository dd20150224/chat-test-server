const mongoose = require('mongoose')
const { Schema } = mongoose

// const NewMessageSchema = new Schema({
//   id: String,
//   type: String, // [user|room]
//   count: Number,
// })

const messageSchema = new Schema(
  {
    senderId: String,
    type: String, // [text]
    text: String,
    roomId: String,
  },
  {
    timestamps: true,
    collection: 'messages',
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
)

messageSchema.virtual('id').get(function() {
  return this._id.toString();
});

messageSchema.virtual('sender', {
  ref: 'User', 
  localField: 'senderId',
  foreignField: 'appUserId',
  justOne: true
});

const Message = mongoose.model('Message', messageSchema);
module.exports = {
  Message,
}
