import React, { useState, useRef, useEffect } from 'react'
import './SearchableSelect.css'

/**
 * Searchable dropdown for project and material selection.
 * Options are filtered as the user types.
 */
const SearchableSelect = ({
  options = [],
  value = '',
  onChange,
  placeholder = 'בחר או חפש....',
  disabled = false,
  id,
  'aria-label': ariaLabel,
}) => {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef(null)

  const selectedOption = options.find((opt) => opt.id === value)
  const displayValue = selectedOption ? selectedOption.name : ''

  const filteredOptions = query.trim()
    ? options.filter((opt) =>
        opt.name.toLowerCase().includes(query.toLowerCase())
      )
    : options

  const close = () => {
    setIsOpen(false)
    setQuery('')
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        close()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (option) => {
    onChange(option.id)
    close()
  }

  const handleInputChange = (e) => {
    setQuery(e.target.value)
    if (!isOpen) setIsOpen(true)
  }

  const handleFocus = () => {
    if (!disabled) setIsOpen(true)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') close()
  }

  return (
    <div
      ref={wrapperRef}
      className={`searchable-select ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}
    >
      <input
        type="text"
        id={id}
        className="searchable-select-input"
        value={isOpen ? query : displayValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={id ? `${id}-listbox` : undefined}
      />
      {isOpen && (
        <ul
          id={id ? `${id}-listbox` : undefined}
          className="searchable-select-list"
          role="listbox"
        >
          {filteredOptions.length === 0 ? (
            <li className="searchable-select-item no-results">No matches</li>
          ) : (
            filteredOptions.map((option) => (
              <li
                key={option.id}
                role="option"
                aria-selected={option.id === value}
                className={`searchable-select-item ${option.id === value ? 'selected' : ''}`}
                onClick={() => handleSelect(option)}
              >
                {option.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

export default SearchableSelect
