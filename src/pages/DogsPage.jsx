import { useState } from 'react';
import { useData } from '../context/DataContext';
import DogForm from '../components/DogForm';
import DogCsvImport from '../components/DogCsvImport';
import BoardingForm from '../components/BoardingForm';
import CsvImport from '../components/CsvImport';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDateTime, calculateNights, formatName } from '../utils/dateUtils';

export default function DogsPage() {
  const { dogs, boardings, addDog, updateDog, deleteDog, toggleDogActive, addBoarding, updateBoarding, deleteBoarding } = useData();

  const [editingDog, setEditingDog] = useState(null);
  const [showAddDogForm, setShowAddDogForm] = useState(false);
  const [showDogCsvImport, setShowDogCsvImport] = useState(false);
  const [showAddBoardingForm, setShowAddBoardingForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editingBoarding, setEditingBoarding] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, type: null, item: null });
  const [sortColumn, setSortColumn] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');

  const handleAddDog = (dogData) => {
    addDog(dogData);
    setShowAddDogForm(false);
  };

  const handleEditDog = (dogData) => {
    updateDog(editingDog.id, dogData);
    setEditingDog(null);
  };

  const handleDeleteDogClick = (dog) => {
    const hasBoardings = boardings.some(b => b.dogId === dog.id);
    setDeleteConfirm({ isOpen: true, type: 'dog', item: dog, hasBoardings });
  };

  const handleAddBoarding = (boardingData) => {
    addBoarding(boardingData);
    setShowAddBoardingForm(false);
  };

  const handleEditBoarding = (boardingData) => {
    updateBoarding(editingBoarding.id, boardingData);
    setEditingBoarding(null);
  };

  const handleDeleteBoardingClick = (boarding) => {
    setDeleteConfirm({ isOpen: true, type: 'boarding', item: boarding });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.type === 'dog') {
      deleteDog(deleteConfirm.item.id);
    } else if (deleteConfirm.type === 'boarding') {
      deleteBoarding(deleteConfirm.item.id);
    }
    setDeleteConfirm({ isOpen: false, type: null, item: null });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getDogName = (dogId) => {
    return formatName(dogs.find(d => d.id === dogId)?.name) || 'Unknown';
  };

  const getDogNightRate = (dogId) => {
    return dogs.find(d => d.id === dogId)?.nightRate || 0;
  };

  const getDeleteMessage = () => {
    if (deleteConfirm.type === 'dog') {
      return deleteConfirm.hasBoardings
        ? `"${deleteConfirm.item?.name}" has boarding records. Deleting will also remove all their boardings. Are you sure?`
        : `Are you sure you want to delete "${deleteConfirm.item?.name}"?`;
    } else if (deleteConfirm.type === 'boarding') {
      const dogName = getDogName(deleteConfirm.item?.dogId);
      return `Are you sure you want to delete this boarding for ${dogName}?`;
    }
    return '';
  };

  const isFormOpen = showAddDogForm || showDogCsvImport || editingDog || showAddBoardingForm || showCsvImport || editingBoarding;

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const trimmedSearch = searchTerm.trim().toLowerCase();
  const filteredAndSortedDogs = [...dogs]
    .filter(dog => (dog.name || '').toLowerCase().includes(trimmedSearch))
    .sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];

      // Case-insensitive string comparison for name
      if (sortColumn === 'name') {
        aVal = (aVal || '').toLowerCase();
        bVal = (bVal || '').toLowerCase();
        const result = aVal.localeCompare(bVal);
        return sortDirection === 'asc' ? result : -result;
      }

      // Numeric comparison for rates
      aVal = aVal || 0;
      bVal = bVal || 0;
      const result = aVal - bVal;
      return sortDirection === 'asc' ? result : -result;
    });

  const SortIcon = ({ column }) => {
    if (sortColumn !== column) {
      return <span className="text-gray-400 ml-1">↕</span>;
    }
    return <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div>
      {/* Dogs Section */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dogs</h1>
        {!isFormOpen && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowDogCsvImport(true)}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Import CSV
            </button>
            <button
              onClick={() => setShowAddDogForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Add Dog
            </button>
          </div>
        )}
      </div>

      {/* Add Dog Form */}
      {showAddDogForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Add New Dog</h2>
          <DogForm
            onSave={handleAddDog}
            onCancel={() => setShowAddDogForm(false)}
          />
        </div>
      )}

      {/* Dog CSV Import */}
      {showDogCsvImport && (
        <div className="mb-6">
          <DogCsvImport onClose={() => setShowDogCsvImport(false)} />
        </div>
      )}

      {/* Edit Dog Form */}
      {editingDog && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Edit Dog</h2>
          <DogForm
            dog={editingDog}
            onSave={handleEditDog}
            onCancel={() => setEditingDog(null)}
          />
        </div>
      )}

      {/* Search */}
      {dogs.length > 0 && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search dogs by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Dog List */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
        {dogs.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No dogs added yet</p>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th
                  className="text-left px-6 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('name')}
                >
                  Name<SortIcon column="name" />
                </th>
                <th
                  className="text-right px-6 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('dayRate')}
                >
                  Day Rate<SortIcon column="dayRate" />
                </th>
                <th
                  className="text-right px-6 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('nightRate')}
                >
                  Night Rate<SortIcon column="nightRate" />
                </th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAndSortedDogs.map((dog) => (
                <tr key={dog.id} className={`hover:bg-gray-50 ${dog.active === false ? 'opacity-50' : ''}`}>
                  <td className={`px-6 py-4 ${dog.active === false ? 'text-gray-400' : 'text-gray-900'}`}>{formatName(dog.name)}</td>
                  <td className={`px-6 py-4 text-right ${dog.active === false ? 'text-gray-400' : 'text-gray-600'}`}>{formatCurrency(dog.dayRate)}</td>
                  <td className={`px-6 py-4 text-right ${dog.active === false ? 'text-gray-400' : 'text-gray-600'}`}>{formatCurrency(dog.nightRate)}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setEditingDog(dog)}
                      disabled={isFormOpen}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleDogActive(dog.id)}
                      disabled={isFormOpen}
                      className="text-amber-600 hover:text-amber-800 text-sm font-medium mr-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {dog.active === false ? 'Activate' : 'Deactivate'}
                    </button>
                    <button
                      onClick={() => handleDeleteDogClick(dog)}
                      disabled={isFormOpen}
                      className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Boardings Section */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Boardings</h2>
        {!isFormOpen && dogs.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowCsvImport(true)}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Import CSV
            </button>
            <button
              onClick={() => setShowAddBoardingForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Add Boarding
            </button>
          </div>
        )}
      </div>

      {/* Add Boarding Form */}
      {showAddBoardingForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Add New Boarding</h2>
          <BoardingForm
            onSave={handleAddBoarding}
            onCancel={() => setShowAddBoardingForm(false)}
          />
        </div>
      )}

      {/* CSV Import */}
      {showCsvImport && (
        <div className="mb-6">
          <CsvImport onClose={() => setShowCsvImport(false)} />
        </div>
      )}

      {/* Edit Boarding Form */}
      {editingBoarding && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Edit Boarding</h2>
          <BoardingForm
            boarding={editingBoarding}
            onSave={handleEditBoarding}
            onCancel={() => setEditingBoarding(null)}
          />
        </div>
      )}

      {/* Boarding List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {boardings.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            {dogs.length === 0 ? 'Add dogs first to create boardings' : 'No boardings added yet'}
          </p>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">Dog</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">Arrival</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">Departure</th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-900">Nights</th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-900">Gross</th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {boardings.map((boarding) => {
                const nights = calculateNights(boarding.arrivalDateTime, boarding.departureDateTime);
                const nightRate = getDogNightRate(boarding.dogId);
                const gross = nights * nightRate;

                return (
                  <tr key={boarding.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-900">{getDogName(boarding.dogId)}</td>
                    <td className="px-6 py-4 text-gray-600">{formatDateTime(boarding.arrivalDateTime)}</td>
                    <td className="px-6 py-4 text-gray-600">{formatDateTime(boarding.departureDateTime)}</td>
                    <td className="px-6 py-4 text-right text-gray-600">{nights}</td>
                    <td className="px-6 py-4 text-right text-gray-600">{formatCurrency(gross)}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setEditingBoarding(boarding)}
                        disabled={isFormOpen}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-4 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteBoardingClick(boarding)}
                        disabled={isFormOpen}
                        className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title={deleteConfirm.type === 'dog' ? 'Delete Dog' : 'Delete Boarding'}
        message={getDeleteMessage()}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, type: null, item: null })}
      />
    </div>
  );
}
