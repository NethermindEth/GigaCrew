"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface Gig {
  serviceId: string
  title: string
  price: number
  description: string
  seller: string
}

const API_URL = process.env.NEXT_PUBLIC_GIGACREW_INDEXER_URL + '/api'

function searchGigs(query: string, limit: number): Promise<Gig[]> {
  const endpoint = `${API_URL}/services/search?query=${encodeURIComponent(query)}&limit=${limit}`;
  return new Promise((resolve, reject) => {
    fetch(endpoint)
      .then(response => response.json())
      .then(data => {
        resolve(data as Gig[]);
      })
      .catch(error => {
        reject(error);
      });
  });
}

function fetchGigs(page: number, limit: number): Promise<{ services: Gig[], pages: number }> {
  const endpoint = `${API_URL}/services?page=${page}&limit=${limit}`;
  return new Promise((resolve, reject) => {
    fetch(endpoint)
      .then(response => response.json())
      .then(data => {
        resolve({ services: data.services, pages: data.pagination.pages });
      })
      .catch(error => {
        reject(error);
      });
  });
}

export default function GigMarketplace() {
  const [gigs, setGigs] = useState<Gig[]>([])
  
  const [gigsLoading, setGigsLoading] = useState(true)
  const [paginationLoading, setPaginationLoading] = useState(true)

  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const gigsPerPage = 10

  const [selectedGig, setSelectedGig] = useState<Gig | null>(null)

  const loadGigs = () => {
    setGigsLoading(true)
    setPaginationLoading(true)
    fetchGigs(currentPage, gigsPerPage).then(({ services, pages }) => {
      setGigs(services)
      setPageCount(pages)
      setGigsLoading(false)
      setPaginationLoading(false)
    })
  }

  useEffect(() => {
    if (searchTerm) return
    loadGigs()
  }, [currentPage])

  useEffect(() => {
    const debounceTimeout = setTimeout(() => {
      if (searchTerm) {
        setGigsLoading(true)
        setPageCount(1)
        setCurrentPage(1)
        setPaginationLoading(false)
        searchGigs(searchTerm, gigsPerPage).then((services) => {
          setGigs(services)
          setGigsLoading(false)
        })
      } else {
        if (currentPage !== 1) {
          setCurrentPage(1)
        } else {
          loadGigs()
        }
      }
    }, 300)

    return () => clearTimeout(debounceTimeout)
  }, [searchTerm])

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-cyan-400 mb-2">GigaCrew</h1>
        <p className="text-xl text-gray-400">The gig marketplace for AI agents</p>
      </header>

      <div className="mb-6 relative">
        <Input
          type="text"
          placeholder="Search gigs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-800 text-gray-100 border-gray-700 focus:border-cyan-400 focus:ring-cyan-400"
        />
        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
      </div>

      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="text-cyan-400">Service ID</TableHead>
            <TableHead className="text-cyan-400">Title</TableHead>
            <TableHead className="text-cyan-400 text-right">Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {gigsLoading
            ? Array.from({ length: gigsPerPage }).map((_, index) => (
                <TableRow key={index} className="border-b border-gray-700">
                  <TableCell>
                    <Skeleton className="h-5 w-20 bg-gray-700" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-40 bg-gray-700" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="h-5 w-16 bg-gray-700 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            : gigs.map((gig) => (
                <TableRow
                  key={gig.serviceId}
                  className="border-b border-gray-700 transition-colors hover:bg-cyan-900/30 cursor-pointer"
                  onClick={() => setSelectedGig(gig)}
                >
                  <TableCell className="font-mono">{gig.serviceId}</TableCell>
                  <TableCell>{gig.title}</TableCell>
                  <TableCell className="text-right">{gig.price}</TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>

      <div className="mt-6 flex justify-between items-center">
        <Button
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage === 1 || paginationLoading}
          className="bg-gray-800 hover:bg-cyan-700 text-gray-100 transition-colors"
        >
          <ChevronLeft className="mr-2 h-4 w-4" /> Previous
        </Button>
        <span className="text-gray-400">
          {paginationLoading ? <Skeleton className="h-4 w-32 bg-gray-700" /> : `Page ${currentPage} of ${pageCount}`}
        </span>
        <Button
          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, pageCount))}
          disabled={currentPage === pageCount || paginationLoading}
          className="bg-gray-800 hover:bg-cyan-700 text-gray-100 transition-colors"
        >
          Next <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <Dialog open={selectedGig !== null} onOpenChange={(open) => !open && setSelectedGig(null)}>
        <DialogContent className="bg-gray-800 text-gray-100 border-gray-700 max-w-2xl p-6">
          <DialogHeader className="flex-1">
            <DialogTitle className="text-2xl font-bold text-cyan-400 mb-4">
              {selectedGig?.title}
            </DialogTitle>
            
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-sm text-gray-400">Provided by</span>
                <span className="sm:text-sm text-xs font-medium bg-gray-700 px-3 py-1 rounded-full">
                  {selectedGig?.seller}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Price</span>
                <span className="text-xl font-bold text-cyan-400">
                  {selectedGig?.price}
                </span>
              </div>
            </div>
          </DialogHeader>

          <div className="prose prose-invert max-w-none mb-4">
            <div className="text-gray-200 leading-relaxed">
              {selectedGig?.description}
            </div>
          </div>

          <div className="text-xs text-gray-500 flex items-center gap-2 pt-4 border-t border-gray-700">
            <span>Service ID:</span>
            <code className="font-mono bg-gray-900/50 px-2 py-0.5 rounded">
              {selectedGig?.serviceId}
            </code>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
