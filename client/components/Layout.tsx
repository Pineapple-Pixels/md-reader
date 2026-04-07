import { Outlet } from 'react-router-dom';
import { SearchModal } from './SearchModal';

interface LayoutProps {
  isPrivate?: boolean;
}

export function Layout({ isPrivate = false }: LayoutProps) {
  return (
    <>
      <Outlet />
      {isPrivate && <SearchModal />}
    </>
  );
}
