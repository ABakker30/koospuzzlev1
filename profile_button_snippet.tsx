
      {/* Profile Button - Top Right (only when signed in) */}
      {user && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000
        }}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 600,
              background: 'rgba(255,255,255,0.3)',
              backdropFilter: 'blur(10px)',
              border: '2px solid rgba(255,255,255,0.5)',
              borderRadius: '12px',
              color: '#fff',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 16px rgba(255,255,255,0.2)',
              textShadow: '0 2px 4px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.5)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <span>👤</span>
            <span>Profile</span>
          </button>
          
          {showProfileMenu && (
            <>
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 999
                }}
                onClick={() => setShowProfileMenu(false)}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  background: 'rgba(0, 0, 0, 0.95)',
                  backdropFilter: 'blur(20px)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '12px',
                  padding: '8px',
                  minWidth: '200px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  zIndex: 1001
                }}
              >
                <div
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.2)',
                    marginBottom: '8px'
                  }}
                >
                  <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>
                    Signed in as
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', marginTop: '4px' }}>
                    {user.email}
                  </div>
                </div>
                
                <button
                  onClick={() => {
                    navigate('/gallery?tab=mine');
                    setShowProfileMenu(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    transition: 'background 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span>🧩</span>
                  <span>My Puzzles</span>
                </button>
                
                <button
                  onClick={() => {
                    logout();
                    setShowProfileMenu(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    transition: 'background 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span>🚪</span>
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
