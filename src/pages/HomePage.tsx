import React from 'react';
import FeatureCard from '../components/FeatureCard';
import './HomePage.css';

const HomePage: React.FC = () => {
  const features = [
    {
      title: 'Shape Selector',
      subtitle: 'Select and edit 3D puzzle shapes',
      access: 'public' as const,
      to: '/shape',
      ctaLabel: 'Select Shape',
    },
    {
      title: 'Solution Viewer',
      subtitle: 'Analyze and visualize puzzle solutions',
      access: 'public' as const,
      to: '/solutions',
      ctaLabel: 'View Solutions',
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
          KOOS Puzzle
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
