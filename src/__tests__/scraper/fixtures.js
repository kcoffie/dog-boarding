/**
 * Mock HTML fixtures for scraper tests
 */

export const mockLoginPage = `
<!DOCTYPE html>
<html>
<head><title>Login</title></head>
<body>
  <form action="/login" method="POST">
    <input type="hidden" name="_token" value="test-csrf-token-123">
    <input type="email" name="username" placeholder="Email">
    <input type="password" name="password" placeholder="Password">
    <button type="submit">Login</button>
  </form>
</body>
</html>
`;

export const mockSchedulePage = `
<!DOCTYPE html>
<html>
<head><title>Schedule</title></head>
<body>
  <div class="schedule">
    <a href="/schedule/a/ABC123/1234567890">Boarding (Nights) - Luna - Dec 21-23</a>
    <a href="/schedule/a/DEF456/1234567891">Boarding (Overnight) - Cooper - Dec 22-25</a>
    <a href="/schedule/a/GHI789/1234567892">Daycare - Max - Dec 21</a>
    <a href="/schedule/a/JKL012/1234567893">Boarding (Nights) - Bella - Dec 24-26</a>
  </div>
  <div class="pagination">
    <a href="/schedule?page=1" class="prev">Previous</a>
    <a href="/schedule?page=3" class="next">Next</a>
  </div>
</body>
</html>
`;

export const mockSchedulePageNoPagination = `
<!DOCTYPE html>
<html>
<head><title>Schedule</title></head>
<body>
  <div class="schedule">
    <a href="/schedule/a/ABC123/1234567890">Boarding (Nights) - Luna - Dec 21-23</a>
  </div>
</body>
</html>
`;

export const mockAppointmentPage = `
<!DOCTYPE html>
<html>
<head><title>Appointment Details</title></head>
<body>
  <h1>Boarding (Nights)</h1>
  <div class="status">Scheduled</div>

  <div class="appointment-details">
    <div class="check-in">PM, Saturday, December 21, 2025</div>
    <div class="check-out">AM, Monday, December 23, 2025</div>
    <div class="duration">2 nights</div>
    <div class="staff">Sarah</div>
  </div>

  <div class="client-info">
    <div class="client-name">John Smith</div>
    <div class="email">john.smith@example.com</div>
    <div class="phone">(555) 123-4567</div>
    <div class="address">123 Main St, Austin, TX 78701</div>
  </div>

  <div class="instructions">
    <p>Access Instructions: Gate code is 1234, key under mat</p>
    <p>Drop off Instructions: Please arrive between 4-6 PM</p>
    <p>Special Notes: Luna loves belly rubs!</p>
  </div>

  <div class="pet-info">
    <img src="/images/pets/luna.jpg" class="pet-photo" alt="Luna">
    <div class="pet-name">Luna</div>
    <div class="breed">Golden Retriever</div>
    <div class="birthdate">March 15, 2020</div>
    <p>Food/Allergies: Grain-free diet, no chicken</p>
    <p>Health/Mobility: Healthy, high energy</p>
    <p>Medications: None</p>
    <p>Behavioral: Friendly with other dogs</p>
    <p>Bite History: None</p>
  </div>

  <div class="veterinarian">
    <p>Vet: Austin Pet Clinic</p>
    <p>Phone: (555) 987-6543</p>
  </div>
</body>
</html>
`;

export const mockAppointmentPageMinimal = `
<!DOCTYPE html>
<html>
<head><title>Appointment Details</title></head>
<body>
  <h1>Boarding</h1>
  <div class="pet-name">Unknown Dog</div>
</body>
</html>
`;

export const mockExternalAppointments = [
  {
    external_id: 'ABC123',
    service_type: 'Boarding (Nights)',
    status: 'Scheduled',
    check_in_datetime: '2025-12-21T17:00:00.000Z',
    check_out_datetime: '2025-12-23T10:00:00.000Z',
    duration: '2 nights',
    client_name: 'John Smith',
    client_email_primary: 'john.smith@example.com',
    pet_name: 'Luna',
    pet_breed: 'Golden Retriever',
  },
  {
    external_id: 'DEF456',
    service_type: 'Boarding (Nights)',
    status: 'Scheduled',
    check_in_datetime: '2025-12-22T17:00:00.000Z',
    check_out_datetime: '2025-12-25T10:00:00.000Z',
    duration: '3 nights',
    client_name: 'Jane Doe',
    client_email_primary: 'jane@example.com',
    pet_name: 'Cooper',
    pet_breed: 'Labrador',
  },
];

export const mockSyncLog = {
  id: 'test-sync-1',
  started_at: '2025-12-20T10:00:00Z',
  completed_at: '2025-12-20T10:00:15Z',
  status: 'success',
  appointments_found: 5,
  appointments_created: 2,
  appointments_updated: 3,
  appointments_failed: 0,
  errors: [],
  duration_ms: 15000,
};
