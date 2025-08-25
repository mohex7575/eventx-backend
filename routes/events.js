const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const Event = require('../models/Event');
const router = express.Router();

// @desc    Get all events
// @route   GET /api/events
// @access  Public
router.get('/', async (req, res) => {
  try {
    const events = await Event.find().populate('createdBy', 'name email');
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

// @desc    Get single event
// @route   GET /api/events/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('createdBy', 'name email');

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

// @desc    Create a new event
// @route   POST /api/events
// @access  Private/Admin
router.post('/', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized as admin' });
    }

    const event = new Event({
      ...req.body,
      createdBy: req.user.id
    });

    const createdEvent = await event.save();
    res.status(201).json(createdEvent);
  } catch (error) {
    res.status(400).json({ message: 'Error creating event: ' + error.message });
  }
});

// @desc    Update an event
// @route   PUT /api/events/:id
// @access  Private/Admin
router.put('/:id', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized as admin' });
    }

    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json(updatedEvent);
  } catch (error) {
    res.status(400).json({ message: 'Error updating event: ' + error.message });
  }
});

// @desc    Delete an event
// @route   DELETE /api/events/:id
// @access  Private/Admin
router.delete('/:id', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized as admin' });
    }

    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: 'Event removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

// @desc    Generate QR Code for event
// @route   POST /api/events/:id/generate-qr
// @access  Private/Admin
router.post('/:id/generate-qr', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized as admin' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // بيانات QR Code (يمكن تخصيصها)
    const qrData = JSON.stringify({
      eventId: event._id,
      eventTitle: event.title,
      eventDate: event.date,
      totalSeats: event.totalSeats,
      availableSeats: event.availableSeats
    });

    event.qrCodeData = qrData;
    await event.save();

    res.json({ 
      message: 'QR Code generated successfully',
      qrCodeData: qrData 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

// @desc    Get event seating arrangement
// @route   GET /api/events/:id/seats
// @access  Public
router.get('/:id/seats', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).select('seats title');
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json({
      eventTitle: event.title,
      seats: event.seats
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

// @desc    Reserve a seat
// @route   POST /api/events/:id/reserve-seat
// @access  Private
router.post('/:id/reserve-seat', protect, async (req, res) => {
  try {
    const { seatNumber } = req.body;
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const seat = event.seats.find(s => s.seatNumber === seatNumber);
    
    if (!seat) {
      return res.status(404).json({ message: 'Seat not found' });
    }

    if (seat.isBooked) {
      return res.status(400).json({ message: 'Seat already booked' });
    }

    // حجز المقعد
    seat.isBooked = true;
    seat.bookedBy = req.user.id;
    seat.bookingDate = new Date();
    event.availableSeats -= 1;

    await event.save();

    res.json({ 
      message: 'Seat reserved successfully',
      seat: seat 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

module.exports = router;