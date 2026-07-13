import React from 'react';

interface FieldShellProps {
  label?: string; help?: string; error?: string; className?: string; children: React.ReactNode;
}

const FieldShell: React.FC<FieldShellProps> = ({ label, help, error, className = '', children }) => (
  <div className={`vds-field ${className}`.trim()}>
    {label && <label className="vds-label">{label}</label>}
    {children}
    {error ? <span className="vds-help vds-help-error">{error}</span> : help && <span className="vds-help">{help}</span>}
  </div>
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string; help?: string; error?: string; wrapClassName?: string;
}

export const Input: React.FC<InputProps> = ({ label, help, error, wrapClassName, className = '', ...rest }) => (
  <FieldShell label={label} help={help} error={error} className={wrapClassName}>
    <input className={`vds-input ${error ? 'vds-input-error' : ''} ${className}`.trim()} {...rest} />
  </FieldShell>
);

export default Input;
