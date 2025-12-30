import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { useData } from '../context/DataContext';

export default function DogCsvImport({ onClose }) {
  const { dogs, addDogs } = useData();
  const fileInputRef = useRef(null);

  const [parsedData, setParsedData] = useState([]);
  const [errors, setErrors] = useState([]);
  const [fileName, setFileName] = useState('');

  const validateRow = (row, rowIndex) => {
    const errors = [];
    const { dogName, dayRate, nightRate } = row;

    // Check name
    if (!dogName || !dogName.trim()) {
      errors.push(`Row ${rowIndex + 1}: Missing dog name`);
    } else if (dogs.some(d => d.name.toLowerCase() === dogName.trim().toLowerCase())) {
      errors.push(`Row ${rowIndex + 1}: Dog "${dogName}" already exists`);
    }

    // Check day rate
    const dayRateNum = parseFloat(dayRate);
    if (dayRate === undefined || dayRate === '') {
      errors.push(`Row ${rowIndex + 1}: Missing day rate`);
    } else if (isNaN(dayRateNum) || dayRateNum < 0) {
      errors.push(`Row ${rowIndex + 1}: Invalid day rate "${dayRate}"`);
    }

    // Check night rate
    const nightRateNum = parseFloat(nightRate);
    if (nightRate === undefined || nightRate === '') {
      errors.push(`Row ${rowIndex + 1}: Missing night rate`);
    } else if (isNaN(nightRateNum) || nightRateNum < 0) {
      errors.push(`Row ${rowIndex + 1}: Invalid night rate "${nightRate}"`);
    }

    return {
      errors,
      data: errors.length === 0 ? {
        name: dogName.trim(),
        dayRate: dayRateNum,
        nightRate: nightRateNum,
      } : null,
    };
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const allErrors = [];
        const validData = [];

        results.data.forEach((row, index) => {
          const { errors, data } = validateRow(row, index);
          allErrors.push(...errors);
          if (data) {
            validData.push(data);
          }
        });

        setErrors(allErrors);
        setParsedData(validData);
      },
      error: (error) => {
        setErrors([`Failed to parse CSV: ${error.message}`]);
        setParsedData([]);
      },
    });
  };

  const handleImport = () => {
    addDogs(parsedData);
    onClose();
  };

  const handleReset = () => {
    setParsedData([]);
    setErrors([]);
    setFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Import Dogs from CSV</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          &times;
        </button>
      </div>

      {/* Format instructions */}
      <div className="mb-4 p-3 bg-gray-50 rounded-md text-sm text-gray-600">
        <p className="font-medium mb-1">Expected CSV format:</p>
        <code className="text-xs bg-gray-200 px-1 py-0.5 rounded">
          dogName,dayRate,nightRate
        </code>
      </div>

      {/* File input */}
      <div className="mb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {fileName && (
          <p className="mt-1 text-sm text-gray-500">Selected: {fileName}</p>
        )}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="font-medium text-red-800 mb-2">Errors found:</p>
          <ul className="list-disc list-inside text-sm text-red-700 max-h-32 overflow-y-auto">
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview */}
      {parsedData.length > 0 && (
        <div className="mb-4">
          <p className="font-medium text-gray-700 mb-2">
            Preview ({parsedData.length} valid dog{parsedData.length !== 1 ? 's' : ''}):
          </p>
          <div className="max-h-48 overflow-y-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-right px-3 py-2">Day Rate</th>
                  <th className="text-right px-3 py-2">Night Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {parsedData.map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(row.dayRate)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(row.nightRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {(parsedData.length > 0 || errors.length > 0) && (
          <button
            onClick={handleReset}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Reset
          </button>
        )}
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        >
          Cancel
        </button>
        {parsedData.length > 0 && (
          <button
            onClick={handleImport}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Import {parsedData.length} Dog{parsedData.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}
