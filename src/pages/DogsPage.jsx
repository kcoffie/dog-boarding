import { useData } from '../context/DataContext';

export default function DogsPage() {
  const { dogs, boardings } = useData();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dogs</h1>
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-gray-600 mb-2">Dogs management coming in Phase 3...</p>
        <div className="text-sm text-gray-500">
          <p>Total dogs: {dogs.length}</p>
          <p>Total boardings: {boardings.length}</p>
        </div>
      </div>
    </div>
  );
}
