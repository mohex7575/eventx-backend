const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const Ticket = require('../models/Ticket');
const Event = require('../models/Event');
const router = express.Router();
const QRCode = require('qrcode');

// @desc    Get user's tickets
// @route   GET /api/tickets/my-tickets
// @access  Private
router.get('/my-tickets', protect, async (req, res) => {
  try {
    const tickets = await Ticket.find({ user: req.user.id })
      .populate('event', 'title date location')
      .sort({ bookingDate: -1 });

    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

// @desc    Book a ticket
// @route   POST /api/tickets/book
// @access  Private
router.post('/book', protect, async (req, res) => {
  try {
    const { eventId, seatNumber } = req.body;

    // التحقق من وجود الفعالية
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // التحقق من أن المقعد متاح
    const seat = event.seats.find(s => s.seatNumber === seatNumber);
    if (!seat || seat.isBooked) {
      return res.status(400).json({ message: 'Seat not available' });
    }

    // حجز المقعد
    seat.isBooked = true;
    seat.bookedBy = req.user.id;
    seat.bookingDate = new Date();
    event.availableSeats -= 1;

    // توليد QR Code
    const qrData = JSON.stringify({
      ticketId: new mongoose.Types.ObjectId(),
      eventId: event._id,
      eventTitle: event.title,
      seatNumber: seatNumber,
      userId: req.user.id,
      bookingDate: new Date()
    });

    const qrCode = await QRCode.toDataURL(qrData);

    // إنشاء التذكرة
    const ticket = new Ticket({
      event: eventId,
      user: req.user.id,
      seatNumber: seatNumber,
      price: event.price,
      qrCode: qrCode
    });

    await Promise.all([event.save(), ticket.save()]);

    res.status(201).json({
      message: 'Ticket booked successfully',
      ticket: {
        ...ticket.toObject(),
        qrCode: qrCode
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

module.exports = router;