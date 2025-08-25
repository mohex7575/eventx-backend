const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  seatNumber: {
    type: String,
    required: true
  },
  bookingDate: {
    type: Date,
    default: Date.now
  },
  price: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['booked', 'cancelled', 'checked-in'],
    default: 'booked'
  },
  qrCode: {
    type: String // سيتم توليده عند الحجز
  }
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema);