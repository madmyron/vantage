import React from 'react';
import { ExternalLink, Github } from 'lucide-react';

const projects = [
  {
    id: 1,
    title: 'Remise Fencing Gear',
    description: 'E-commerce platform for fencing equipment with custom product configurator and real-time inventory management.',
    tags: ['React', 'Node.js', 'PostgreSQL', 'Stripe'],
    liveUrl: 'https://remisefencinggear.com',
    githubUrl: 'https://github.com/example/remise-fencing',
    isCheckerboard: true,
  },
  {
    id: 2,
    title: 'TaskFlow Dashboard',
    description: 'Project management tool with drag-and-drop kanban boards, team collaboration, and analytics.',
    tags: ['Vue.js', 'Firebase', 'Tailwind CSS'],
    liveUrl: '#',
    githubUrl: '#',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    id: 3,
    title: 'WeatherSphere',
    description: 'Beautiful weather application with animated visualizations and 7-day forecasts using OpenWeather API.',
    tags: ['React', 'D3.js', 'REST API'],
    liveUrl: '#',
    githubUrl: '#',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  },
  {
    id: 4,
    title: 'CryptoTrack',
    description: 'Real-time cryptocurrency portfolio tracker with price alerts and historical performance charts.',
    tags: ['Next.js', 'WebSocket', 'Chart.js'],
    liveUrl: '#',
    githubUrl: '#',
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  },
  {
    id: 5,
    title: 'RecipeVault',
    description: 'Recipe discovery and meal planning app with nutritional analysis and grocery list generation.',
    tags: ['React Native', 'GraphQL', 'MongoDB'],
    liveUrl: '#',
    githubUrl: '#',
    gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  },
  {
    id: 6,
    title: 'CodeCollab',
    description: 'Real-time collaborative code editor with syntax highlighting, video chat, and git integration.',
    tags: ['React', 'Socket.io', 'Docker'],
    liveUrl: '#',
    githubUrl: '#',
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  },
];

const checkerboardStyle = {
  backgroundImage: `repeating-conic-gradient(#1a1a1a 0% 25%, #f0f0f0 0% 50%)`,
  backgroundSize: '32px 32px',
  backgroundPosition: '0 0',
};

function ProjectCard({ project }) {
  const cardBackground = project.isCheckerboard
    ? checkerboardStyle
    : { background: project.gradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' };

  return (
    <div
      style={{
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.18)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.12)';
      }}
    >
      <div
        style={{
          height: '180px',
          ...cardBackground,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {project.isCheckerboard && (
          <span
            style={{
              fontSize: '48px',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
            }}
          >
            ⚔️
          </span>
        )}
      </div>

      <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1a1a2e' }}>
          {project.title}
        </h3>

        <p style={{ margin: 0, fontSize: '14px', color: '#555', lineHeight: 1.6, flex: 1 }}>
          {project.description}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {project.tags.map(tag => (
            <span
              key={tag}
              style={{
                padding: '3px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                background: '#f0f0ff',
                color: '#5a5af5',
                border: '1px solid #ddddf5',
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
          <a
            href={project.liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#5a5af5',
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1.5px solid #5a5af5',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0f0ff'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <ExternalLink size={13} /> Live
          </a>
          <a
            href={project.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#333',
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1.5px solid #ccc',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Github size={13} /> Code
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Portfolio() {
  return (
    <section id="portfolio" style={{ padding: '80px 24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h2 style={{ fontSize: '36px', fontWeight: 800, color: '#1a1a2e', margin: '0 0 12px' }}>
          My Projects
        </h2>
        <p style={{ fontSize: '16px', color: '#666', maxWidth: '500px', margin: '0 auto' }}>
          A selection of things I've built — from side projects to production apps.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '28px',
        }}
      >
        {projects.map(project => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
}