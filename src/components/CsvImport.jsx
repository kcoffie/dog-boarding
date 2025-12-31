import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { useData } from '../context/DataContext';
import { formatName } from '../utils/dateUtils';

export default function CsvImport({ onClose }) {
  const { dogs, addBoardings } = useData();
  const fileInputRef = useRef(null);

  const [parsedData, setParsedData] = useState([]);
  const [errors, setErrors] = useState([]);
  const [fileName, setFileName] = useState('');

  const validateRow = (row, rowIndex) => {
    const errors = [];
    const { dogName, arrivalDateTime, departureDateTime } = row;

    // Trim and normalize dog name
    const trimmedDogName = dogName?.trim();

    // Check dog exists (case-insensitive matching)
    const dog = dogs.find(d => d.name.toLowerCase().trim() === trimmedDogName?.toLowerCase());
    if (!trimmedDogName) {
      errors.push(`Row ${rowIndex + 1}: Missing dog name`);
    } else if (!dog) {
      const availableDogs = dogs.map(d => d.name).join(', ');
      errors.push(`Row ${rowIndex + 1}: Unknown dog "${trimmedDogName}". Available dogs: ${availableDogs || 'none'}`);
    }

    // Parse and validate dates
    let arrival = null;
    let departure = null;

    if (!arrivalDateTime?.trim()) {
      errors.push(`Row ${rowIndex + 1}: Missing arrival date/time`);
    } else {
      arrival = parseDateTime(arrivalDateTime);
      if (!arrival) {
        errors.push(`Row ${rowIndex + 1}: Invalid arrival date "${arrivalDateTime.trim()}". Use format: YYYY-MM-DD HH:mm`);
      }
    }

    if (!departureDateTime?.trim()) {
      errors.push(`Row ${rowIndex + 1}: Missing departure date/time`);
    } else {
      departure = parseDateTime(departureDateTime);
      if (!departure) {
        errors.push(`Row ${rowIndex + 1}: Invalid departure date "${departureDateTime.trim()}". Use format: YYYY-MM-DD HH:mm`);
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

    // Trim whitespace
    const trimmed = str.trim();
    if (!trimmed) return null;

    // Try ISO 8601 format first
    let date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Try "YYYY-MM-DD HH:mm" format
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
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

    // Try "YYYY-MM-DD" format (default to noon)
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      date = new Date(
        parseInt(dateOnlyMatch[1]),
        parseInt(dateOnlyMatch[2]) - 1,
        parseInt(dateOnlyMatch[3]),
        12, 0
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

  const handleImport = async () => {
    const boardings = parsedData.map(({ dogId, arrivalDateTime, departureDateTime }) => ({
      dogId,
      arrivalDateTime,
      departureDateTime,
    }));

    try {
      await addBoardings(boardings);
      onClose();
    } catch (err) {
      setErrors([`Failed to import boardings: ${err.message}`]);
    }
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
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Import Boardings from CSV</h2>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Format instructions */}
      <div className="mb-5 p-4 bg-slate-50 rounded-xl border border-slate-100">
        <p className="font-medium text-slate-700 mb-2 text-sm">Expected CSV format:</p>
        <code className="text-xs bg-slate-200/60 text-slate-700 px-2 py-1 rounded-md font-mono">
          dogName,arrivalDateTime,departureDateTime
        </code>
        <p className="mt-3 text-xs text-slate-500">
          Date formats: ISO 8601 or "YYYY-MM-DD HH:mm"
        </p>
      </div>

      {/* File input */}
      <div className="mb-5">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 file:transition-colors file:cursor-pointer"
        />
        {fileName && (
          <p className="mt-2 text-sm text-slate-500">Selected: {fileName}</p>
        )}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mb-5 p-4 bg-red-50 border border-red-100 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium text-red-800 text-sm">Errors found:</p>
          </div>
          <ul className="list-disc list-inside text-sm text-red-700 max-h-32 overflow-y-auto space-y-1">
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview */}
      {parsedData.length > 0 && (
        <div className="mb-5">
          <p className="font-medium text-slate-700 mb-3 text-sm">
            Preview ({parsedData.length} valid boarding{parsedData.length !== 1 ? 's' : ''}):
          </p>
          <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dog</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Arrival</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Departure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsedData.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{formatName(row.dogName)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDateTime(row.arrivalDateTime)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDateTime(row.departureDateTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        {(parsedData.length > 0 || errors.length > 0) && (
          <button
            onClick={handleReset}
            className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Reset
          </button>
        )}
        <button
          onClick={onClose}
          className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          Cancel
        </button>
        {parsedData.length > 0 && (
          <button
            onClick={handleImport}
            className="px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] rounded-lg transition-all shadow-sm"
          >
            Import {parsedData.length} Boarding{parsedData.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}
