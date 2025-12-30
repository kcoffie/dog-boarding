import { useState, useEffect } from 'react';
import Select from 'react-select';
import { useData } from '../context/DataContext';
import { toDateInputValue, toTimeInputValue, combineDateAndTime, formatName } from '../utils/dateUtils';

export default function BoardingForm({ boarding, preselectedDogId, onSave, onCancel }) {
  const { dogs } = useData();

  const [dogId, setDogId] = useState(preselectedDogId || '');
  const [arrivalDate, setArrivalDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('14:00');
  const [departureDate, setDepartureDate] = useState('');
  const [departureTime, setDepartureTime] = useState('10:00');
  const [errors, setErrors] = useState({});

  const isEditing = !!boarding;

  // Build options for react-select
  const dogOptions = dogs
    .filter((dog) => dog.active !== false || (isEditing && dog.id === boarding?.dogId))
    .map((dog) => ({
      value: dog.id,
      label: formatName(dog.name),
    }));

  const selectedDog = dogOptions.find((opt) => opt.value === dogId) || null;

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

  // Custom styles for react-select to match our design
  const selectStyles = {
    control: (base, state) => ({
      ...base,
      minHeight: '42px',
      borderRadius: '0.5rem',
      borderColor: errors.dogId ? '#ef4444' : state.isFocused ? '#6366f1' : '#cbd5e1',
      boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
      '&:hover': {
        borderColor: errors.dogId ? '#ef4444' : '#6366f1',
      },
      backgroundColor: isEditing ? '#f8fafc' : 'white',
    }),
    placeholder: (base) => ({
      ...base,
      color: '#94a3b8',
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected ? '#6366f1' : state.isFocused ? '#eef2ff' : 'white',
      color: state.isSelected ? 'white' : '#1e293b',
      '&:active': {
        backgroundColor: '#c7d2fe',
      },
    }),
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Dog
        </label>
        <Select
          value={selectedDog}
          onChange={(option) => setDogId(option?.value || '')}
          options={dogOptions}
          isDisabled={isEditing}
          isClearable
          placeholder="Select a dog..."
          noOptionsMessage={() => "No dogs found"}
          styles={selectStyles}
        />
        {errors.dogId && <p className="text-red-600 text-sm mt-1.5">{errors.dogId}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Arrival Date
          </label>
          <input
            type="date"
            value={arrivalDate}
            onChange={(e) => setArrivalDate(e.target.value)}
            className={`w-full px-3.5 py-2.5 text-sm bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
              errors.arrivalDate ? 'border-red-500' : 'border-slate-300'
            }`}
          />
          {errors.arrivalDate && <p className="text-red-600 text-sm mt-1.5">{errors.arrivalDate}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Arrival Time
          </label>
          <input
            type="time"
            value={arrivalTime}
            onChange={(e) => setArrivalTime(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Departure Date
          </label>
          <input
            type="date"
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
            className={`w-full px-3.5 py-2.5 text-sm bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
              errors.departureDate ? 'border-red-500' : 'border-slate-300'
            }`}
          />
          {errors.departureDate && <p className="text-red-600 text-sm mt-1.5">{errors.departureDate}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Departure Time
          </label>
          <input
            type="time"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
        >
          {isEditing ? 'Save Changes' : 'Add Boarding'}
        </button>
      </div>
    </form>
  );
}
