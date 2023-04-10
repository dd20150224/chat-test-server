const mongoose = require('mongoose')
const { Schema } = mongoose

const NewMessageSchema = new Schema(
  {
    id: String,
    type: String, // [user|room]
    count: Number,
  }
)

const userSchema = new Schema(
  {
    appUserId: String,
    displayName: String,
    letterName: String,
    avatarUrl: String,
    newMessages: [NewMessageSchema],
  },
  {
    timestamps: true,
    collection: 'users',
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
)

userSchema.virtual('id').get(function () {
  return this._id.toString()
})

const User = mongoose.model('User', userSchema)
module.exports = {
  User,
}
