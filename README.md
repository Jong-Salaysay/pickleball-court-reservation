# Pickleball Court Reservation System

A web-based court booking and management system with an integrated AI chatbot, built for the ITS120L term project.

## Features

- Player registration and login with hashed passwords and sessions
- Real-time availability calendar (reads bookings, open play sessions, and blocked slots)
- Court booking with double-booking protection and multi-hour reservations
- My Bookings page with reschedule and cancel (locked within 6 hours of start time)
- AI chatbot that answers availability and rate questions and can book through conversation
- Admin panel: manage all bookings, walk-in encoding, payment recording, open play sessions, schedule blocking, user management, and reports
- Automatic cancellation of unpaid e-wallet bookings 3 hours before start time

## Tech Stack

- HTML, SASS, JavaScript (front end)
- Node.js with Express (back end)
- MySQL via XAMPP (database)
- Anthropic API (AI chatbot)

## Local Setup

1. Install [Node.js](https://nodejs.org) and [XAMPP](https://www.apachefriends.org).
2. Start Apache and MySQL from the XAMPP Control Panel.
3. Open phpMyAdmin (http://localhost/phpmyadmin), create a database named `pickleball_db` with collation `utf8mb4_general_ci`.
4. Run `db/schema.sql` in the SQL tab, then run `db/migration-admin.sql`.
5. Clone this repository and install dependencies:
   ```
   git clone https://github.com/Jong-Salaysay/pickleball-court-reservation.git
   cd pickleball-court-reservation
   npm install
   ```
6. Create a `.env` file in the project root with your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=your-key-here
   ```
7. Start the server:
   ```
   node server.js
   ```
8. Open http://localhost:3000

## Accounts

- Players register through the site.
- Admin login: `admin@court.com` / `admin123` (change the password after setup).

## Business Rules

- Operating hours: 6:00-9:00 AM and 5:00-10:00 PM daily
- Court reservation: P150 per hour, 1 to 3 hours
- Open play: P100 per head, walk-in only
- Players cannot reschedule or cancel within 6 hours of the booking start
- Unpaid e-wallet bookings are automatically cancelled 3 hours before start
