import { useState, Fragment } from 'react';
import { useData } from '../context/DataContext';
import DogForm from '../components/DogForm';
import DogCsvImport from '../components/DogCsvImport';
import BoardingForm from '../components/BoardingForm';
import CsvImport from '../components/CsvImport';
import ConfirmDialog from '../components/ConfirmDialog';
import InlineDeleteButton from '../components/InlineDeleteButton';
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
  const [boardingSortColumn, setBoardingSortColumn] = useState('arrivalDateTime');
  const [boardingSortDirection, setBoardingSortDirection] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [inlineAddBoardingDogId, setInlineAddBoardingDogId] = useState(null);

  const handleAddDog = async (dogData) => {
    try {
      await addDog(dogData);
      setShowAddDogForm(false);
    } catch (err) {
      console.error('Failed to add dog:', err);
    }
  };

  const handleEditDog = async (dogData) => {
    try {
      await updateDog(editingDog.id, dogData);
      setEditingDog(null);
    } catch (err) {
      console.error('Failed to update dog:', err);
    }
  };

  const handleDeleteDogClick = (dog) => {
    const hasBoardings = boardings.some(b => b.dogId === dog.id);
    setDeleteConfirm({ isOpen: true, type: 'dog', item: dog, hasBoardings });
  };

  const handleAddBoarding = async (boardingData) => {
    try {
      await addBoarding(boardingData);
      setShowAddBoardingForm(false);
    } catch (err) {
      console.error('Failed to add boarding:', err);
    }
  };

  const handleInlineAddBoarding = async (boardingData) => {
    try {
      await addBoarding(boardingData);
      setInlineAddBoardingDogId(null);
    } catch (err) {
      console.error('Failed to add boarding:', err);
    }
  };

  const handleDogNameClick = (dog) => {
    if (dog.active === false) return; // Don't allow for inactive dogs
    setInlineAddBoardingDogId(dog.id);
  };

  const handleEditBoarding = async (boardingData) => {
    try {
      await updateBoarding(editingBoarding.id, boardingData);
      setEditingBoarding(null);
    } catch (err) {
      console.error('Failed to update boarding:', err);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      if (deleteConfirm.type === 'dog') {
        await deleteDog(deleteConfirm.item.id);
      }
      setDeleteConfirm({ isOpen: false, type: null, item: null });
    } catch (err) {
      console.error('Failed to delete:', err);
    }
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

  const getInitials = (name) => {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  };

  const getBoardingStatus = (boarding) => {
    const now = new Date();
    const arrival = new Date(boarding.arrivalDateTime);
    const departure = new Date(boarding.departureDateTime);

    if (now < arrival) return 'upcoming';
    if (now > departure) return 'past';
    return 'current';
  };

  const statusConfig = {
    current: { label: 'Current', bg: 'bg-emerald-100', text: 'text-emerald-700' },
    upcoming: { label: 'Upcoming', bg: 'bg-sky-100', text: 'text-sky-700' },
    past: { label: 'Past', bg: 'bg-slate-100', text: 'text-slate-500' },
  };

  const getDeleteMessage = () => {
    if (!deleteConfirm.item) return '';
    return deleteConfirm.hasBoardings
      ? `"${deleteConfirm.item.name}" has boarding records. Deleting will also remove all their boardings. Are you sure?`
      : `Are you sure you want to delete "${deleteConfirm.item.name}"?`;
  };

  const isFormOpen = showAddDogForm || showDogCsvImport || editingDog || showAddBoardingForm || showCsvImport || editingBoarding || inlineAddBoardingDogId;

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleBoardingSort = (column) => {
    if (boardingSortColumn === column) {
      setBoardingSortDirection(boardingSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setBoardingSortColumn(column);
      setBoardingSortDirection('asc');
    }
  };

  const trimmedSearch = searchTerm.trim().toLowerCase();
  const filteredAndSortedDogs = [...dogs]
    .filter(dog => (dog.name || '').toLowerCase().includes(trimmedSearch))
    .sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];

      if (sortColumn === 'name') {
        aVal = (aVal || '').toLowerCase();
        bVal = (bVal || '').toLowerCase();
        const result = aVal.localeCompare(bVal);
        return sortDirection === 'asc' ? result : -result;
      }

      aVal = aVal || 0;
      bVal = bVal || 0;
      const result = aVal - bVal;
      return sortDirection === 'asc' ? result : -result;
    });

  const SortIcon = ({ column }) => {
    if (sortColumn !== column) {
      return <span className="text-slate-300 ml-1">↕</span>;
    }
    return <span className="ml-1 text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  const BoardingSortIcon = ({ column }) => {
    if (boardingSortColumn !== column) {
      return <span className="text-slate-300 ml-1">↕</span>;
    }
    return <span className="ml-1 text-indigo-600">{boardingSortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  const sortedBoardings = [...boardings].sort((a, b) => {
    let aVal, bVal;

    switch (boardingSortColumn) {
      case 'dogName':
        aVal = getDogName(a.dogId).toLowerCase();
        bVal = getDogName(b.dogId).toLowerCase();
        break;
      case 'status':
        // Sort order: current, upcoming, past
        const statusOrder = { current: 0, upcoming: 1, past: 2 };
        aVal = statusOrder[getBoardingStatus(a)];
        bVal = statusOrder[getBoardingStatus(b)];
        break;
      case 'arrivalDateTime':
      case 'departureDateTime':
        aVal = new Date(a[boardingSortColumn]).getTime();
        bVal = new Date(b[boardingSortColumn]).getTime();
        break;
      case 'nights':
        aVal = calculateNights(a.arrivalDateTime, a.departureDateTime);
        bVal = calculateNights(b.arrivalDateTime, b.departureDateTime);
        break;
      case 'gross':
        aVal = calculateNights(a.arrivalDateTime, a.departureDateTime) * getDogNightRate(a.dogId);
        bVal = calculateNights(b.arrivalDateTime, b.departureDateTime) * getDogNightRate(b.dogId);
        break;
      default:
        return 0;
    }

    if (typeof aVal === 'string') {
      const result = aVal.localeCompare(bVal);
      return boardingSortDirection === 'asc' ? result : -result;
    }

    const result = aVal - bVal;
    return boardingSortDirection === 'asc' ? result : -result;
  });

  return (
    <div className="space-y-8">
      {/* Boardings Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Boardings</h1>
            <p className="text-slate-500 mt-1">Manage boarding reservations</p>
          </div>
          {!isFormOpen && dogs.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowCsvImport(true)}
                className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import CSV
              </button>
              <button
                onClick={() => setShowAddBoardingForm(true)}
                className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Boarding
              </button>
            </div>
          )}
        </div>

        {/* Add Boarding Form */}
        {showAddBoardingForm && (
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Add New Boarding</h2>
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

        {/* Boarding List */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          {boardings.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">No boardings yet</h3>
              <p className="text-slate-500">{dogs.length === 0 ? 'Add dogs first to create boardings' : 'Click "Add Boarding" to get started'}</p>
            </div>
          ) : (
            <>
            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-slate-100">
              {sortedBoardings.map((boarding) => {
                const nights = calculateNights(boarding.arrivalDateTime, boarding.departureDateTime);
                const nightRate = getDogNightRate(boarding.dogId);
                const gross = nights * nightRate;
                const dogName = getDogName(boarding.dogId);
                const status = getBoardingStatus(boarding);
                const statusStyle = statusConfig[status];
                const isEditing = editingBoarding?.id === boarding.id;

                return (
                  <div key={boarding.id} className={`p-4 ${isEditing ? 'bg-indigo-50/50' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-indigo-600">{getInitials(dogName)}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">{dogName}</div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            {statusStyle.label}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-semibold text-slate-900">{formatCurrency(gross)}</div>
                        <div className="text-xs text-slate-500">{nights} nights</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Arrival:</span>
                        <span>{formatDateTime(boarding.arrivalDateTime)}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-slate-500">Departure:</span>
                        <span>{formatDateTime(boarding.departureDateTime)}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-4">
                      <button
                        onClick={() => setEditingBoarding(isEditing ? null : boarding)}
                        disabled={isFormOpen && !isEditing}
                        className="min-h-[44px] flex-1 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all select-none"
                      >
                        {isEditing ? 'Cancel' : 'Edit'}
                      </button>
                      <InlineDeleteButton
                        onDelete={() => deleteBoarding(boarding.id)}
                        disabled={isFormOpen}
                        className="flex-1"
                      />
                    </div>
                    {isEditing && (
                      <div className="mt-4 pt-4 border-t border-indigo-200">
                        <h3 className="text-sm font-semibold text-slate-900 mb-4">
                          Edit Boarding for {dogName}
                        </h3>
                        <BoardingForm
                          boarding={editingBoarding}
                          onSave={handleEditBoarding}
                          onCancel={() => setEditingBoarding(null)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table Layout */}
            <table className="w-full hidden md:table">
              <thead>
                <tr className="border-b border-slate-200">
                  <th
                    className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleBoardingSort('dogName')}
                  >
                    Dog<BoardingSortIcon column="dogName" />
                  </th>
                  <th
                    className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleBoardingSort('status')}
                  >
                    Status<BoardingSortIcon column="status" />
                  </th>
                  <th
                    className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleBoardingSort('arrivalDateTime')}
                  >
                    Arrival<BoardingSortIcon column="arrivalDateTime" />
                  </th>
                  <th
                    className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleBoardingSort('departureDateTime')}
                  >
                    Departure<BoardingSortIcon column="departureDateTime" />
                  </th>
                  <th
                    className="text-right px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleBoardingSort('nights')}
                  >
                    Nights<BoardingSortIcon column="nights" />
                  </th>
                  <th
                    className="text-right px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleBoardingSort('gross')}
                  >
                    Gross<BoardingSortIcon column="gross" />
                  </th>
                  <th className="text-right px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedBoardings.map((boarding) => {
                  const nights = calculateNights(boarding.arrivalDateTime, boarding.departureDateTime);
                  const nightRate = getDogNightRate(boarding.dogId);
                  const gross = nights * nightRate;
                  const dogName = getDogName(boarding.dogId);
                  const status = getBoardingStatus(boarding);
                  const statusStyle = statusConfig[status];
                  const isEditing = editingBoarding?.id === boarding.id;

                  return (
                    <Fragment key={boarding.id}>
                      <tr className={`hover:bg-slate-50/50 transition-colors ${isEditing ? 'bg-indigo-50/50' : ''}`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-indigo-600">{getInitials(dogName)}</span>
                            </div>
                            <span className="text-sm font-medium text-slate-900">{dogName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            {statusStyle.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">{formatDateTime(boarding.arrivalDateTime)}</td>
                        <td className="px-5 py-4 text-sm text-slate-600">{formatDateTime(boarding.departureDateTime)}</td>
                        <td className="px-5 py-4 text-sm text-slate-600 text-right tabular-nums">{nights}</td>
                        <td className="px-5 py-4 text-sm font-medium text-slate-900 text-right tabular-nums">{formatCurrency(gross)}</td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => setEditingBoarding(isEditing ? null : boarding)}
                            disabled={isFormOpen && !isEditing}
                            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 mr-4 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isEditing ? 'Cancel' : 'Edit'}
                          </button>
                          <InlineDeleteButton
                            onDelete={() => deleteBoarding(boarding.id)}
                            disabled={isFormOpen}
                            className="!min-h-0 !py-1 !px-2 text-xs"
                          />
                        </td>
                      </tr>
                      {isEditing && (
                        <tr>
                          <td colSpan={7} className="px-5 py-5 bg-indigo-50/50 border-l-4 border-indigo-500">
                            <div className="max-w-2xl">
                              <h3 className="text-sm font-semibold text-slate-900 mb-4">
                                Edit Boarding for {dogName}
                              </h3>
                              <BoardingForm
                                boarding={editingBoarding}
                                onSave={handleEditBoarding}
                                onCancel={() => setEditingBoarding(null)}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </>
          )}
        </div>
      </div>

      {/* Dogs Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Dogs</h2>
            <p className="text-slate-500 mt-1">Manage your dog roster</p>
          </div>
          {!isFormOpen && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowDogCsvImport(true)}
                className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import CSV
              </button>
              <button
                onClick={() => setShowAddDogForm(true)}
                className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Dog
              </button>
            </div>
          )}
        </div>

        {/* Add Dog Form */}
        {showAddDogForm && (
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Add New Dog</h2>
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
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Edit Dog</h2>
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
            <div className="relative max-w-xs">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search dogs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
        )}

        {/* Dog List */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          {dogs.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">No dogs yet</h3>
              <p className="text-slate-500">Click "Add Dog" to get started</p>
            </div>
          ) : (
            <>
            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredAndSortedDogs.map((dog) => (
                <div key={dog.id} className={`p-4 ${dog.active === false ? 'opacity-50' : ''} ${inlineAddBoardingDogId === dog.id ? 'bg-indigo-50/50' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-indigo-600">{getInitials(formatName(dog.name))}</span>
                      </div>
                      <div className="min-w-0">
                        {dog.active !== false ? (
                          <button
                            onClick={() => handleDogNameClick(dog)}
                            disabled={isFormOpen && inlineAddBoardingDogId !== dog.id}
                            className="font-medium text-indigo-600 hover:text-indigo-800 disabled:text-slate-900 disabled:cursor-default transition-colors truncate block"
                          >
                            {formatName(dog.name)}
                          </button>
                        ) : (
                          <span className="font-medium text-slate-400 truncate block">{formatName(dog.name)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm text-slate-600">
                        <span className="text-slate-400">Day:</span> {formatCurrency(dog.dayRate)}
                      </div>
                      <div className="text-sm text-slate-600">
                        <span className="text-slate-400">Night:</span> {formatCurrency(dog.nightRate)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setEditingDog(dog)}
                      disabled={isFormOpen}
                      className="min-h-[44px] flex-1 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all select-none"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleDogActive(dog.id)}
                      disabled={isFormOpen}
                      className="min-h-[44px] flex-1 px-3 py-2 text-sm font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all select-none"
                    >
                      {dog.active === false ? 'Activate' : 'Deactivate'}
                    </button>
                    <button
                      onClick={() => handleDeleteDogClick(dog)}
                      disabled={isFormOpen}
                      className="min-h-[44px] flex-1 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all select-none"
                    >
                      Delete
                    </button>
                  </div>
                  {inlineAddBoardingDogId === dog.id && (
                    <div className="mt-4 pt-4 border-t border-indigo-200">
                      <h3 className="text-sm font-semibold text-slate-900 mb-4">
                        Add Boarding for {formatName(dog.name)}
                      </h3>
                      <BoardingForm
                        preselectedDogId={dog.id}
                        onSave={handleInlineAddBoarding}
                        onCancel={() => setInlineAddBoardingDogId(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table Layout */}
            <table className="w-full hidden md:table">
              <thead>
                <tr className="border-b border-slate-200">
                  <th
                    className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    Name<SortIcon column="name" />
                  </th>
                  <th
                    className="text-right px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleSort('dayRate')}
                  >
                    Day Rate<SortIcon column="dayRate" />
                  </th>
                  <th
                    className="text-right px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleSort('nightRate')}
                  >
                    Night Rate<SortIcon column="nightRate" />
                  </th>
                  <th className="text-right px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedDogs.map((dog) => (
                  <Fragment key={dog.id}>
                    <tr className={`hover:bg-slate-50/50 transition-colors ${dog.active === false ? 'opacity-50' : ''}`}>
                      <td className={`px-5 py-4 ${dog.active === false ? 'text-slate-400' : 'text-slate-900'}`}>
                        {dog.active !== false ? (
                          <button
                            onClick={() => handleDogNameClick(dog)}
                            disabled={isFormOpen && inlineAddBoardingDogId !== dog.id}
                            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline disabled:text-slate-900 disabled:no-underline disabled:cursor-default transition-colors"
                          >
                            {formatName(dog.name)}
                          </button>
                        ) : (
                          <span className="text-sm font-medium">{formatName(dog.name)}</span>
                        )}
                      </td>
                      <td className={`px-5 py-4 text-sm text-right tabular-nums ${dog.active === false ? 'text-slate-400' : 'text-slate-600'}`}>{formatCurrency(dog.dayRate)}</td>
                      <td className={`px-5 py-4 text-sm text-right tabular-nums ${dog.active === false ? 'text-slate-400' : 'text-slate-600'}`}>{formatCurrency(dog.nightRate)}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => setEditingDog(dog)}
                          disabled={isFormOpen}
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 mr-4 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleDogActive(dog.id)}
                          disabled={isFormOpen}
                          className="text-sm font-medium text-amber-600 hover:text-amber-800 mr-4 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {dog.active === false ? 'Activate' : 'Deactivate'}
                        </button>
                        <button
                          onClick={() => handleDeleteDogClick(dog)}
                          disabled={isFormOpen}
                          className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {inlineAddBoardingDogId === dog.id && (
                      <tr>
                        <td colSpan={4} className="px-5 py-5 bg-indigo-50/50 border-l-4 border-indigo-500">
                          <div className="max-w-2xl">
                            <h3 className="text-sm font-semibold text-slate-900 mb-4">
                              Add Boarding for {formatName(dog.name)}
                            </h3>
                            <BoardingForm
                              preselectedDogId={dog.id}
                              onSave={handleInlineAddBoarding}
                              onCancel={() => setInlineAddBoardingDogId(null)}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>
      </div>

      {/* Delete Dog Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Dog"
        message={getDeleteMessage()}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, type: null, item: null })}
      />
    </div>
  );
}
