const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const Event = require('../models/Event');
const QRCode = require('qrcode');
const router = express.Router();

// @desc    Get all active events with filtering and pagination
// @route   GET /api/events
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search, sortBy = 'date', sortOrder = 'asc' } = req.query;
    
    // Build filter object
    const filter = { isActive: true, date: { $gt: new Date() } };
    
    if (category && category !== 'all') {
      filter.category = category.toLowerCase();
    }
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } }
      ];
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const events = await Event.find(filter)
      .populate('createdBy', 'name email')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Event.countDocuments(filter);

    res.json({
      events,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ message: 'Server error while fetching events' });
  }
});

// @desc    Get single event with seat information
// @route   GET /api/events/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('seats.bookedBy', 'name email');

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!event.isActive) {
      return res.status(404).json({ message: 'Event is no longer available' });
    }

    res.json(event);
  } catch (error) {
    console.error('Get event error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid event ID format' });
    }
    res.status(500).json({ message: 'Server error while fetching event' });
  }
});

// ------------------ Added QR generation route (supports GET & POST) ------------------
// @desc    Generate QR code for event
// @route   GET|POST /api/events/:id/generate-qr
// @access  Public
const generateQrHandler = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Prefer existing env names used in your project (CLIENT_URL), fall back to FRONTEND_URL or localhost
    const frontendUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:3000';

    // QR payload: front-end event page link (you can change to any payload you want)
    const qrData = `${frontendUrl}/event/${event._id}`;

    // Generate QR as Data URL (base64 PNG)
    const qrImage = await QRCode.toDataURL(qrData);

    res.json({ qrCode: qrImage, data: qrData });
  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({ message: 'Server error while generating QR code' });
  }
};

router.get('/:id/generate-qr', generateQrHandler);
router.post('/:id/generate-qr', generateQrHandler);
// ------------------------------------------------------------------------------------

// @desc    Create a new event
// @route   POST /api/events
// @access  Private/Admin
router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const eventData = {
      ...req.body,
      createdBy: req.user.id
    };

    // Validate date is in the future
    if (new Date(eventData.date) <= new Date()) {
      return res.status(400).json({ message: 'Event date must be in the future' });
    }

    const event = new Event(eventData);
    const createdEvent = await event.save();
    
    await createdEvent.populate('createdBy', 'name email');
    
    res.status(201).json(createdEvent);
  } catch (error) {
    console.error('Create event error:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error', errors });
    }
    res.status(500).json({ message: 'Server error while creating event' });
  }
});

// @desc    Update an event
// @route   PUT /api/events/:id
// @access  Private/Admin
router.put('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Prevent updating seats directly through this endpoint
    const { seats, ...updateData } = req.body;

    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    res.json(updatedEvent);
  } catch (error) {
    console.error('Update event error:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error', errors });
    }
    res.status(500).json({ message: 'Server error while updating event' });
  }
});

// @desc    Delete an event (soft delete)
// @route   DELETE /api/events/:id
// @access  Private/Admin
router.delete('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Soft delete instead of actual deletion
    event.isActive = false;
    await event.save();

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ message: 'Server error while deleting event' });
  }
});

// @desc    Get event seating arrangement
// @route   GET /api/events/:id/seats
// @access  Public
router.get('/:id/seats', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .select('seats title totalSeats availableSeats isActive date')
      .populate('seats.bookedBy', 'name email');

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!event.isActive) {
      return res.status(404).json({ message: 'Event is no longer available' });
    }

    // Check if event date has passed
    if (new Date(event.date) < new Date()) {
      return res.status(400).json({ message: 'Event has already occurred' });
    }

    res.json({
      eventTitle: event.title,
      totalSeats: event.totalSeats,
      availableSeats: event.availableSeats,
      seats: event.seats
    });
  } catch (error) {
    console.error('Get seats error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid event ID format' });
    }
    res.status(500).json({ message: 'Server error while fetching seats' });
  }
});

// @desc    Reserve a seat
// @route   POST /api/events/:id/reserve-seat
// @access  Private
router.post('/:id/reserve-seat', protect, async (req, res) => {
  try {
    const { seatNumber } = req.body;
    
    if (!seatNumber) {
      return res.status(400).json({ message: 'Seat number is required' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!event.isActive) {
      return res.status(404).json({ message: 'Event is no longer available' });
    }

    // Check if event date has passed
    if (new Date(event.date) < new Date()) {
      return res.status(400).json({ message: 'Event has already occurred' });
    }

    // Use the method from the model
    await event.bookSeat(seatNumber, req.user.id);
    
    await event.populate('seats.bookedBy', 'name email');
    const updatedSeat = event.seats.find(s => s.seatNumber === seatNumber);

    res.json({ 
      message: 'Seat reserved successfully',
      seat: updatedSeat,
      availableSeats: event.availableSeats
    });
  } catch (error) {
    console.error('Reserve seat error:', error);
    if (error.message === 'Seat not found' || error.message === 'Seat already booked') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error while reserving seat' });
  }
});

// @desc    Cancel seat reservation
// @route   POST /api/events/:id/cancel-seat
// @access  Private
router.post('/:id/cancel-seat', protect, async (req, res) => {
  try {
    const { seatNumber } = req.body;
    
    if (!seatNumber) {
      return res.status(400).json({ message: 'Seat number is required' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if the seat belongs to the current user
    const seat = event.seats.find(s => s.seatNumber === seatNumber);
    if (!seat) {
      return res.status(404).json({ message: 'Seat not found' });
    }

    if (!seat.isBooked) {
      return res.status(400).json({ message: 'Seat is not booked' });
    }

    if (seat.bookedBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only cancel your own reservations' });
    }

    // Use the method from the model
    await event.cancelBooking(seatNumber);

    res.json({ 
      message: 'Reservation cancelled successfully',
      availableSeats: event.availableSeats
    });
  } catch (error) {
    console.error('Cancel seat error:', error);
    res.status(500).json({ message: 'Server error while cancelling reservation' });
  }
});

// @desc    Get user's booked events
// @route   GET /api/events/user/bookings
// @access  Private
router.get('/user/bookings', protect, async (req, res) => {
  try {
    const events = await Event.find({
      'seats.bookedBy': req.user.id,
      isActive: true,
      date: { $gt: new Date() }
    }).populate('createdBy', 'name email');

    const bookedEvents = events.map(event => ({
      event: {
        _id: event._id,
        title: event.title,
        date: event.date,
        location: event.location
      },
      seats: event.seats.filter(seat => 
        seat.bookedBy && seat.bookedBy.toString() === req.user.id
      )
    }));

    res.json(bookedEvents);
  } catch (error) {
    console.error('Get user bookings error:', error);
    res.status(500).json({ message: 'Server error while fetching bookings' });
  }
});

module.exports = router;
