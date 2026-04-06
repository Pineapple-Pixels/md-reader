import { useState } from 'react';

interface HelloProps {
  name?: string;
}

export function Hello({ name = 'md-reader' }: HelloProps) {
  const [count, setCount] = useState(0);

  return (
    <div className="p-4 rounded-lg border border-blue-200 bg-blue-50 my-4">
      <h3 className="text-lg font-semibold text-blue-900">
        React Island: Hello, {name}!
      </h3>
      <p className="text-sm text-blue-700 mt-1">
        Esta es una isla React montada dentro del HTML server-rendered.
      </p>
      <button
        onClick={() => setCount((c) => c + 1)}
        className="mt-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
      >
        Clicks: {count}
      </button>
    </div>
  );
}
