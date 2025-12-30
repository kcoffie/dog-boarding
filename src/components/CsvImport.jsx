import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { useData } from '../context/DataContext';

export default function CsvImport({ onClose }) {
  const { dogs, addBoardings } = useData();
  const fileInputRef = useRef(null);

  const [parsedData, setParsedData] = useState([]);
  const [errors, setErrors] = useState([]);
  const [fileName, setFileName] = useState('');

  const validateRow = (row, rowIndex) => {
    const errors = [];
    const { dogName, arrivalDateTime, departureDateTime } = row;

    // Check dog exists
    const dog = dogs.find(d => d.name.toLowerCase() === dogName?.toLowerCase());
    if (!dogName) {
      errors.push(`Row ${rowIndex + 1}: Missing dog name`);
    } else if (!dog) {
      errors.push(`Row ${rowIndex + 1}: Unknown dog "${dogName}"`);
    }

    // Parse and validate dates
    let arrival = null;
    let departure = null;

    if (!arrivalDateTime) {
      errors.push(`Row ${rowIndex + 1}: Missing arrival date/time`);
    } else {
      arrival = parseDateTime(arrivalDateTime);
      if (!arrival) {
        errors.push(`Row ${rowIndex + 1}: Invalid arrival date "${arrivalDateTime}"`);
      }
    }

    if (!departureDateTime) {
      errors.push(`Row ${rowIndex + 1}: Missing departure date/time`);
    } else {
      departure = parseDateTime(departureDateTime);
      if (!departure) {
        errors.push(`Row ${rowIndex + 1}: Invalid departure date "${departureDateTime}"`);
      }
    }

    // Check departure is after arrival
    if (arrival && departure && departure <= arrival) {
      errors.push(`Row ${rowIndex + 1}: Departure must be after arrival`);
    }

    return {
      errors,
      data: errors.length === 0 ? {
        dogId: dog?.id,
        dogName: dog?.name,
        arrivalDateTime: arrival?.toISOString(),
        departureDateTime: departure?.toISOString(),
      } : null,
    };
  };

  const parseDateTime = (str) => {
    if (!str) return null;

    // Try ISO 8601 format
    let date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Try "YYYY-MM-DD HH:mm" format
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (match) {
      date = new Date(
        parseInt(match[1]),
        parseInt(match[2]) - 1,
        parseInt(match[3]),
        parseInt(match[4]),
        parseInt(match[5])
      );
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
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
    const boardings = parsedData.map(({ dogId, arrivalDateTime, departureDateTime }) => ({
      dogId,
      arrivalDateTime,
      departureDateTime,
    }));

    addBoardings(boardings);
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

  const formatDateTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Import Boardings from CSV</h2>
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
          dogName,arrivalDateTime,departureDateTime
        </code>
        <p className="mt-2 text-xs">
          Date formats: ISO 8601 or "YYYY-MM-DD HH:mm"
        </p>
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
            Preview ({parsedData.length} valid boarding{parsedData.length !== 1 ? 's' : ''}):
          </p>
          <div className="max-h-48 overflow-y-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Dog</th>
                  <th className="text-left px-3 py-2">Arrival</th>
                  <th className="text-left px-3 py-2">Departure</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {parsedData.map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{row.dogName}</td>
                    <td className="px-3 py-2">{formatDateTime(row.arrivalDateTime)}</td>
                    <td className="px-3 py-2">{formatDateTime(row.departureDateTime)}</td>
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
            Import {parsedData.length} Boarding{parsedData.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}
