import { useState } from 'react';
import { useData } from '../context/DataContext';
import DogForm from '../components/DogForm';
import ConfirmDialog from '../components/ConfirmDialog';

export default function DogsPage() {
  const { dogs, boardings, addDog, updateDog, deleteDog } = useData();

  const [editingDog, setEditingDog] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, dog: null });

  const handleAddDog = (dogData) => {
    addDog(dogData);
    setShowAddForm(false);
  };

  const handleEditDog = (dogData) => {
    updateDog(editingDog.id, dogData);
    setEditingDog(null);
  };

  const handleDeleteClick = (dog) => {
    const hasBoardings = boardings.some(b => b.dogId === dog.id);
    setDeleteConfirm({ isOpen: true, dog, hasBoardings });
  };

  const handleConfirmDelete = () => {
    deleteDog(deleteConfirm.dog.id);
    setDeleteConfirm({ isOpen: false, dog: null });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dogs</h1>
        {!showAddForm && !editingDog && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Add Dog
          </button>
        )}
      </div>

      {/* Add Dog Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Add New Dog</h2>
          <DogForm
            onSave={handleAddDog}
            onCancel={() => setShowAddForm(false)}
          />
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

      {/* Dog List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {dogs.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No dogs added yet</p>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">Name</th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-900">Day Rate</th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-900">Night Rate</th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {dogs.map((dog) => (
                <tr key={dog.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-900">{dog.name}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatCurrency(dog.dayRate)}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatCurrency(dog.nightRate)}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setEditingDog(dog)}
                      disabled={showAddForm || editingDog}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteClick(dog)}
                      disabled={showAddForm || editingDog}
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Dog"
        message={
          deleteConfirm.hasBoardings
            ? `"${deleteConfirm.dog?.name}" has boarding records. Deleting will also remove all their boardings. Are you sure?`
            : `Are you sure you want to delete "${deleteConfirm.dog?.name}"?`
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, dog: null })}
      />
    </div>
  );
}
