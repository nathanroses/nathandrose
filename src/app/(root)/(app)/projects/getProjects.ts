import { IRepository } from '@/types'
import timeFromNow from '@/utils/time-from-now'
import 'server-only'

const username = process.env.GH_USERNAME || 'dedeard'
const repositoriesUrl = `https://api.github.com/users/${username}/repos?sort=updated&visibility=public&affiliation=owner`

const fetchOptions: RequestInit = {
  method: 'GET',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + process.env.GH_API_KEY,
    'X-GitHub-Api-Version': '2022-11-28',
  },
  next: { revalidate: 60 * 60 * 24 },
}

const getProjects = async () => {
  try {
    const response = await fetch(repositoriesUrl, fetchOptions)
    if (!response.ok) throw new Error('Failed to fetch repositories')
    
    const json = await response.json()
    if (!Array.isArray(json)) throw new Error('API response is not an array')

    const repositories = json.filter((r) => r.languages_url && r.description)

    const promises = repositories.map(async (repo) => {
      try {
        const languageResponse = await fetch(repo.languages_url, fetchOptions)
        if (!languageResponse.ok) throw new Error('Failed to fetch languages')

        const data = await languageResponse.json()
        if (typeof data !== 'object') throw new Error('Languages response is not an object')

        const names = Object.keys(data)
        const languages = names.map(name => ({
          name,
          size: (data[name] / Object.values(data).reduce((a, b) => a + b, 0)) * 100,
        }))

        const commitsResponse = await fetch(`https://api.github.com/repos/${repo.full_name}/commits?per_page=1`, fetchOptions)
        if (!commitsResponse.ok) throw new Error('Failed to fetch commits')

        const commits = await commitsResponse.json()
        if (!Array.isArray(commits)) throw new Error('Commits response is not an array')

        return {
          ...repo,
          last_commit_at: commits.length > 0 ? timeFromNow(commits[0].commit.committer.date) : '',
          last_commit_date: commits.length > 0 ? commits[0].commit.committer.date : '',
          languages,
        } as IRepository
      } catch (error) {
        console.error(`Error processing repository ${repo.name}:`, error)
        return null
      }
    })

    const data = (await Promise.all(promises)).filter(Boolean).sort((a, b) => {
      const dateA = new Date(a.last_commit_date)
      const dateB = new Date(b.last_commit_date)
      return dateB - dateA
    })

    return data
  } catch (error) {
    console.error('Error fetching projects:', error)
    // Depending on your setup, you might want to return an empty array or handle the error differently
    return []
  }
}

export default getProjects
