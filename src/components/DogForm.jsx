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
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`w-full px-3.5 py-2.5 text-sm bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
            errors.name ? 'border-red-500' : 'border-slate-300'
          }`}
          placeholder="Enter dog name"
        />
        {errors.name && <p className="text-red-600 text-sm mt-1.5">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Day Rate
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={dayRate}
              onChange={(e) => setDayRate(e.target.value)}
              className={`w-full pl-8 pr-3.5 py-2.5 text-sm bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                errors.dayRate ? 'border-red-500' : 'border-slate-300'
              }`}
              placeholder="0.00"
            />
          </div>
          {errors.dayRate && <p className="text-red-600 text-sm mt-1.5">{errors.dayRate}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Night Rate
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={nightRate}
              onChange={(e) => setNightRate(e.target.value)}
              className={`w-full pl-8 pr-3.5 py-2.5 text-sm bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                errors.nightRate ? 'border-red-500' : 'border-slate-300'
              }`}
              placeholder="0.00"
            />
          </div>
          {errors.nightRate && <p className="text-red-600 text-sm mt-1.5">{errors.nightRate}</p>}
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
          {isEditing ? 'Save Changes' : 'Add Dog'}
        </button>
      </div>
    </form>
  );
}
