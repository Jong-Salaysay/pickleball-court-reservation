ALTER TABLE bookings MODIFY user_id INT NULL;
ALTER TABLE bookings ADD COLUMN walk_in_name VARCHAR(100) NULL;

INSERT INTO users (email, password_hash, first_name, last_name, contact_number, role)
VALUES ('admin@court.com', '$2b$10$PehqH7HMKC4AIzJmHnCi8e46L6VDaOzsfG2ovyJap7Uwq8TYHeYYC', 'Court', 'Admin', '00000000000', 'admin');
