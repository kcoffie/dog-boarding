import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { toDateInputValue, toTimeInputValue, combineDateAndTime } from '../utils/dateUtils';

export default function BoardingForm({ boarding, onSave, onCancel }) {
  const { dogs } = useData();

  const [dogId, setDogId] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('14:00');
  const [departureDate, setDepartureDate] = useState('');
  const [departureTime, setDepartureTime] = useState('10:00');
  const [errors, setErrors] = useState({});

  const isEditing = !!boarding;

  useEffect(() => {
    if (boarding) {
      setDogId(boarding.dogId);
      setArrivalDate(toDateInputValue(boarding.arrivalDateTime));
      setArrivalTime(toTimeInputValue(boarding.arrivalDateTime));
      setDepartureDate(toDateInputValue(boarding.departureDateTime));
      setDepartureTime(toTimeInputValue(boarding.departureDateTime));
    }
  }, [boarding]);

  const validate = () => {
    const newErrors = {};

    if (!dogId) {
      newErrors.dogId = 'Please select a dog';
    }

    if (!arrivalDate) {
      newErrors.arrivalDate = 'Arrival date is required';
    }

    if (!departureDate) {
      newErrors.departureDate = 'Departure date is required';
    }

    if (arrivalDate && departureDate && arrivalTime && departureTime) {
      const arrival = new Date(combineDateAndTime(arrivalDate, arrivalTime));
      const departure = new Date(combineDateAndTime(departureDate, departureTime));

      if (departure <= arrival) {
        newErrors.departureDate = 'Departure must be after arrival';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    onSave({
      dogId,
      arrivalDateTime: combineDateAndTime(arrivalDate, arrivalTime),
      departureDateTime: combineDateAndTime(departureDate, departureTime),
    });

    if (!isEditing) {
      setDogId('');
      setArrivalDate('');
      setArrivalTime('14:00');
      setDepartureDate('');
      setDepartureTime('10:00');
      setErrors({});
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Dog
        </label>
        <select
          value={dogId}
          onChange={(e) => setDogId(e.target.value)}
          disabled={isEditing}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.dogId ? 'border-red-500' : 'border-gray-300'
          } ${isEditing ? 'bg-gray-100' : ''}`}
        >
          <option value="">Select a dog...</option>
          {dogs.map((dog) => (
            <option key={dog.id} value={dog.id}>
              {dog.name}
            </option>
          ))}
        </select>
        {errors.dogId && <p className="text-red-500 text-sm mt-1">{errors.dogId}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Arrival Date
          </label>
          <input
            type="date"
            value={arrivalDate}
            onChange={(e) => setArrivalDate(e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.arrivalDate ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.arrivalDate && <p className="text-red-500 text-sm mt-1">{errors.arrivalDate}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Arrival Time
          </label>
          <input
            type="time"
            value={arrivalTime}
            onChange={(e) => setArrivalTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Departure Date
          </label>
          <input
            type="date"
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.departureDate ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.departureDate && <p className="text-red-500 text-sm mt-1">{errors.departureDate}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Departure Time
          </label>
          <input
            type="time"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          {isEditing ? 'Save Changes' : 'Add Boarding'}
        </button>
      </div>
    </form>
  );
}
