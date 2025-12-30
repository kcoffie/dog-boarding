import { useState, useEffect } from 'react';

export default function DogForm({ dog, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [dayRate, setDayRate] = useState('');
  const [nightRate, setNightRate] = useState('');
  const [errors, setErrors] = useState({});

  const isEditing = !!dog;

  useEffect(() => {
    if (dog) {
      setName(dog.name);
      setDayRate(dog.dayRate.toString());
      setNightRate(dog.nightRate.toString());
    }
  }, [dog]);

  const validate = () => {
    const newErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    const dayRateNum = parseFloat(dayRate);
    if (isNaN(dayRateNum) || dayRateNum < 0) {
      newErrors.dayRate = 'Must be a valid positive number';
    }

    const nightRateNum = parseFloat(nightRate);
    if (isNaN(nightRateNum) || nightRateNum < 0) {
      newErrors.nightRate = 'Must be a valid positive number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    onSave({
      name: name.trim(),
      dayRate: parseFloat(dayRate),
      nightRate: parseFloat(nightRate),
    });

    if (!isEditing) {
      setName('');
      setDayRate('');
      setNightRate('');
      setErrors({});
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.name ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Dog name"
        />
        {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Day Rate ($)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={dayRate}
            onChange={(e) => setDayRate(e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.dayRate ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="0.00"
          />
          {errors.dayRate && <p className="text-red-500 text-sm mt-1">{errors.dayRate}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Night Rate ($)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={nightRate}
            onChange={(e) => setNightRate(e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.nightRate ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="0.00"
          />
          {errors.nightRate && <p className="text-red-500 text-sm mt-1">{errors.nightRate}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-2">
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
          {isEditing ? 'Save Changes' : 'Add Dog'}
        </button>
      </div>
    </form>
  );
}
