const express = require('express');
const mongoose = require('mongoose');
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
    const tickets = await Ticket.find({ user: req.user.id, status: { $ne: 'cancelled' } })
      .populate('event', 'title date location image')
      .sort({ bookingDate: -1 });

    res.json(tickets);
  } catch (error) {
    console.error('Get my tickets error:', error);
    res.status(500).json({ message: 'Server error while fetching tickets' });
  }
});

// @desc    Book a ticket
// @route   POST /api/tickets/book
// @access  Private
router.post('/book', protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { eventId, seatNumber } = req.body;

    if (!eventId || !seatNumber) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Event ID and seat number are required' });
    }

    // التحقق من وجود الفعالية
    const event = await Event.findById(eventId).session(session);
    if (!event || !event.isActive) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Event not found or not active' });
    }

    // التحقق من أن الفعالية لم تبدأ بعد
    if (new Date(event.date) < new Date()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Event has already occurred' });
    }

    // التحقق من أن المقعد متاح
    const seat = event.seats.find(s => s.seatNumber === seatNumber);
    if (!seat) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Seat not found' });
    }

    if (seat.isBooked) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Seat already booked' });
    }

    // التحقق من أن المستخدم لم يحجز هذا المقعد مسبقاً
    const existingTicket = await Ticket.findOne({
      event: eventId,
      user: req.user.id,
      seatNumber: seatNumber,
      status: 'booked'
    }).session(session);

    if (existingTicket) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'You already booked this seat' });
    }

    // توليد QR Code
    const ticketId = new mongoose.Types.ObjectId();
    const qrData = JSON.stringify({
      ticketId: ticketId,
      eventId: event._id,
      eventTitle: event.title,
      seatNumber: seatNumber,
      userId: req.user.id,
      bookingDate: new Date().toISOString()
    });

    const qrCode = await QRCode.toDataURL(qrData);

    // إنشاء التذكرة
    const ticket = new Ticket({
      _id: ticketId,
      event: eventId,
      user: req.user.id,
      seatNumber: seatNumber,
      price: event.price,
      qrCode: qrCode,
      status: 'booked'
    });

    // تحديث حالة المقعد في الفعالية
    seat.isBooked = true;
    seat.bookedBy = req.user.id;
    seat.bookingDate = new Date();
    event.availableSeats -= 1;

    await ticket.save({ session });
    await event.save({ session });

    await session.commitTransaction();
    session.endSession();

    // إرجاع البيانات مع معلومات إضافية
    const populatedTicket = await Ticket.findById(ticket._id)
      .populate('event', 'title date location')
      .populate('user', 'name email');

    res.status(201).json({
      message: 'Ticket booked successfully',
      ticket: populatedTicket
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Book ticket error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Server error while booking ticket' });
  }
});

// @desc    Cancel a ticket
// @route   POST /api/tickets/cancel/:ticketId
// @access  Private
router.post('/cancel/:ticketId', protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { ticketId } = req.params;

    const ticket = await Ticket.findById(ticketId).session(session);
    if (!ticket) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // التحقق من أن التذكرة للمستخدم الحالي
    if (ticket.user.toString() !== req.user.id) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Not authorized to cancel this ticket' });
    }

    // التحقق من أن التذكرة لم يتم إلغاؤها مسبقاً
    if (ticket.status === 'cancelled') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Ticket already cancelled' });
    }

    // العثور على الفعالية وتحرير المقعد
    const event = await Event.findById(ticket.event).session(session);
    if (event) {
      const seat = event.seats.find(s => s.seatNumber === ticket.seatNumber);
      if (seat) {
        seat.isBooked = false;
        seat.bookedBy = null;
        seat.bookingDate = null;
        event.availableSeats += 1;
        await event.save({ session });
      }
    }

    // تحديث حالة التذكرة
    ticket.status = 'cancelled';
    ticket.cancelledAt = new Date();
    await ticket.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: 'Ticket cancelled successfully',
      ticketId: ticket._id
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Cancel ticket error:', error);
    res.status(500).json({ message: 'Server error while cancelling ticket' });
  }
});

// @desc    Get ticket by ID
// @route   GET /api/tickets/:ticketId
// @access  Private
router.get('/:ticketId', protect, async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await Ticket.findById(ticketId)
      .populate('event', 'title date location image')
      .populate('user', 'name email');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // التحقق من أن المستخدم يملك التذكرة أو هو admin
    if (ticket.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this ticket' });
    }

    res.json(ticket);

  } catch (error) {
    console.error('Get ticket error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid ticket ID' });
    }
    res.status(500).json({ message: 'Server error while fetching ticket' });
  }
});

// @desc    Verify ticket by QR code
// @route   POST /api/tickets/verify
// @access  Private/Admin
router.post('/verify', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { qrData } = req.body;

    if (!qrData) {
      return res.status(400).json({ message: 'QR data is required' });
    }

    const ticketInfo = JSON.parse(qrData);
    const ticket = await Ticket.findById(ticketInfo.ticketId)
      .populate('event', 'title date location')
      .populate('user', 'name email');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (ticket.status !== 'booked') {
      return res.status(400).json({ 
        message: `Ticket is ${ticket.status}`,
        status: ticket.status
      });
    }

    // تحديث حالة التذكرة إلى checked-in
    ticket.status = 'checked-in';
    ticket.checkedInAt = new Date();
    await ticket.save();

    res.json({
      valid: true,
      message: 'Ticket verified successfully',
      ticket: ticket
    });

  } catch (error) {
    console.error('Verify ticket error:', error);
    res.status(500).json({ message: 'Server error while verifying ticket' });
  }
});

module.exports = router;