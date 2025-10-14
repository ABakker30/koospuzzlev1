import React from 'react';
import FeatureCard from '../components/FeatureCard';
import './HomePage.css';

const HomePage: React.FC = () => {

  const features = [
    {
      title: 'Shape Editor',
      subtitle: 'Create and edit 3D puzzle shapes',
      access: 'public' as const,
      to: '/shape',
      ctaLabel: 'Create Shapes',
    },
    {
      title: 'Solution Viewer',
      subtitle: 'Analyze and visualize puzzle solutions',
      access: 'public' as const,
      to: '/solutions',
      ctaLabel: 'View Solutions',
    },
    {
      title: 'Auto Solver',
      subtitle: 'Generate solutions automatically',
      access: 'private' as const,
      to: '/autosolver',
      ctaLabel: 'Auto Solve',
    },
    {
      title: 'Manual Puzzle',
      subtitle: 'Interactive puzzle solving experience',
      access: 'private' as const,
      to: '/manual',
      ctaLabel: 'Play Puzzle',
    },
    {
      title: 'Content Studio',
      subtitle: 'Create videos and images from your puzzles',
      access: 'public' as const,
      to: '/studio',
      ctaLabel: 'Create Content',
    },
  ];

  return (
    <div className="home-page" style={{ padding: '2rem 0', width: '100vw', boxSizing: 'border-box' }}>
      <section>
        <h2 style={{ 
          fontSize: '2rem', 
          marginBottom: '2rem', 
          textAlign: 'center',
          color: '#333'
        }}>
          Explore Features
        </h2>
        <div className="feature-grid">
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              title={feature.title}
              subtitle={feature.subtitle}
              access={feature.access}
              to={feature.to}
              ctaLabel={feature.ctaLabel}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
