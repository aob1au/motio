import React from 'react';

interface EmailLinkProps {
  email: string;
  className?: string;
}

export const EmailLink: React.FC<EmailLinkProps> = ({
  email,
  className = '',
}) => {
  const address = email.trim();

  if (!address) return null;

  return (
    <a
      href={`mailto:${encodeURIComponent(address).replace(/%40/g, '@')}`}
      className={`cursor-pointer underline underline-offset-2 hover:text-primary focus-visible:text-primary ${className}`}
      title={`Send email to ${address}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {address}
    </a>
  );
};
