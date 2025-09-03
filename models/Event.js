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
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  date: {
    type: Date,
    required: true,
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'Event date must be in the future'
    }
  },
  time: {
    type: String,
    required: true,
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter a valid time format (HH:MM)']
  },
  location: {
    type: String,
    required: true,
    maxlength: 200
  },
  totalSeats: {
    type: Number,
    required: true,
    min: 1,
    max: 1000
  },
  availableSeats: {
    type: Number,
    required: true,
    default: function() { return this.totalSeats; },
    min: 0
  },
  price: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  category: {
    type: String,
    required: true,
    enum: ['conference', 'workshop', 'concert', 'webinar', 'sports', 'networking', 'other'],
    lowercase: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  image: {
    type: String,
    default: ''
  },
  seats: [seatSchema],
  qrCodeData: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for checking if event is sold out
eventSchema.virtual('isSoldOut').get(function() {
  return this.availableSeats === 0;
});

// ✅ Virtual for formatted date (آمن ضد null/undefined)
eventSchema.virtual('formattedDate').get(function() {
  if (!this.date) return null;
  return this.date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Auto-create seats when totalSeats is modified
eventSchema.pre('save', function(next) {
  if (this.isModified('totalSeats')) {
    this.availableSeats = this.totalSeats;
    
    // Generate seats with proper row structure (A-1, A-2, B-1, B-2, etc.)
    this.seats = [];
    const rows = Math.ceil(this.totalSeats / 10); // 10 seats per row
    let seatCounter = 1;
    
    for (let row = 0; row < rows; row++) {
      const rowLetter = String.fromCharCode(65 + row); // A, B, C, etc.
      const seatsInRow = Math.min(10, this.totalSeats - (row * 10));
      
      for (let seat = 1; seat <= seatsInRow; seat++) {
        this.seats.push({
          seatNumber: `${rowLetter}-${seat}`,
          isBooked: false
        });
        seatCounter++;
      }
    }
  }
  next();
});

// Update available seats when a seat is booked
eventSchema.methods.bookSeat = function(seatNumber, userId) {
  const seat = this.seats.find(s => s.seatNumber === seatNumber);
  
  if (!seat) {
    throw new Error('Seat not found');
  }
  
  if (seat.isBooked) {
    throw new Error('Seat already booked');
  }
  
  seat.isBooked = true;
  seat.bookedBy = userId;
  seat.bookingDate = new Date();
  this.availableSeats -= 1;
  
  return this.save();
};

// Method to cancel a booking
eventSchema.methods.cancelBooking = function(seatNumber) {
  const seat = this.seats.find(s => s.seatNumber === seatNumber);
  
  if (!seat) {
    throw new Error('Seat not found');
  }
  
  if (!seat.isBooked) {
    throw new Error('Seat is not booked');
  }
  
  seat.isBooked = false;
  seat.bookedBy = undefined;
  seat.bookingDate = undefined;
  this.availableSeats += 1;
  
  return this.save();
};

// Static method to find active events
eventSchema.statics.findActive = function() {
  return this.find({ isActive: true, date: { $gt: new Date() } });
};

// Index for better performance
eventSchema.index({ date: 1, isActive: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Event', eventSchema);
