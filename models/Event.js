const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
  seatNumber: {
    type: String,
    required: true
  },
  isBooked: {
    type: Boolean,
    default: false
  },
  bookedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  bookingDate: {
    type: Date
  }
});

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  totalSeats: {
    type: Number,
    required: true,
    min: 1
  },
  availableSeats: {
    type: Number,
    required: true,
    default: function() { return this.totalSeats; }
  },
  price: {
    type: Number,
    required: true,
    default: 0
  },
  category: {
    type: String,
    required: true,
    enum: ['Conference', 'Workshop', 'Concert', 'Webinar', 'Sports', 'Other']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  seats: [seatSchema], // مصفوفة المقاعد
  qrCodeData: {
    type: String // لتخزين بيانات QR Code
  }
}, { timestamps: true });

// تحديث المقاعد المتاحة عند تعديل إجمالي المقاعد
eventSchema.pre('save', function(next) {
  if (this.isModified('totalSeats')) {
    this.availableSeats = this.totalSeats;
    // إنشاء مصفوفة المقاعد
    this.seats = [];
    for (let i = 1; i <= this.totalSeats; i++) {
      this.seats.push({ seatNumber: `A-${i}`, isBooked: false });
    }
  }
  next();
});

module.exports = mongoose.model('Event', eventSchema);