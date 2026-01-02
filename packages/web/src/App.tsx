import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { ProjectDetail } from './pages/ProjectDetail'
import { ObjectDetail } from './pages/ObjectDetail'
import { TypeDetail } from './pages/TypeDetail'
import { Issues } from './pages/Issues'
import { SchemaReference } from './pages/SchemaReference'
import { CreateForm } from './pages/CreateForm'
import { Export } from './pages/Export'
import { Search } from './pages/Search'
import { Graph } from './pages/Graph'
import { Websites } from './pages/Websites'
import { Tags } from './pages/Tags'
import { Review } from './pages/Review'
import { Refcheck } from './pages/Refcheck'
import { Status } from './pages/Status'
import { Settings } from './pages/Settings'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/project/:project" element={<ProjectDetail />} />
          <Route path="/object/:path" element={<ObjectDetail />} />
          <Route path="/type/:type" element={<TypeDetail />} />
          <Route path="/issues" element={<Issues />} />
          <Route path="/schemas" element={<SchemaReference />} />
          <Route path="/create-form" element={<CreateForm />} />
          <Route path="/export" element={<Export />} />
          <Route path="/search" element={<Search />} />
          <Route path="/graph" element={<Graph />} />
          <Route path="/tags" element={<Tags />} />
          <Route path="/review" element={<Review />} />
          <Route path="/refcheck" element={<Refcheck />} />
          <Route path="/websites" element={<Websites />} />
          <Route path="/status" element={<Status />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
