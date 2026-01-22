import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import yaml from 'js-yaml'

export async function GET(request: Request) {
  try {
    // Lire le fichier openapi.yaml depuis la racine du projet
    const filePath = join(process.cwd(), 'openapi.yaml')
    const fileContent = await readFile(filePath, 'utf-8')

    // Parser le YAML en JSON pour une meilleure compatibilité avec swagger-ui-react
    const jsonContent = yaml.load(fileContent)

    // Vérifier le format demandé via query param
    const url = new URL(request.url)
    const format = url.searchParams.get('format')

    if (format === 'yaml') {
      // Retourner le YAML brut si demandé
      return new NextResponse(fileContent, {
        headers: {
          'Content-Type': 'application/yaml; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }

    // Par défaut, retourner en JSON (meilleure compatibilité)
    return NextResponse.json(jsonContent, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Error reading OpenAPI file:', error)
    return NextResponse.json(
      { error: 'Failed to load OpenAPI specification' },
      { status: 500 }
    )
  }
}
