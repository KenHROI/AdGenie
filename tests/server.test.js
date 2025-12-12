const request = require('supertest');

// --- Mocks Setup ---

// Mocks Setup
// Mock Sharp
const mockToBuffer = jest.fn();
const mockJpeg = jest.fn(() => ({ toBuffer: mockToBuffer }));
const mockMetadata = jest.fn();
const mockResize = jest.fn(() => ({ jpeg: mockJpeg }));
const mockSharp = jest.fn(() => ({ resize: mockResize, metadata: mockMetadata }));

jest.mock('sharp', () => mockSharp);

// Mock Supabase
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();
const mockNeq = jest.fn(); // Added neq
const mockOrder = jest.fn();
const mockSingle = jest.fn();
const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockRemove = jest.fn();

// Create a builder that is also a Promise (thenable)
// ensuring that 'await builder' returns a default resolved value
const queryBuilder = {
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
    eq: mockEq,
    neq: mockNeq,
    order: mockOrder,
    single: mockSingle,
    then: function (resolve) { resolve({ data: [], error: null }); } // Default resolve
};

// Chainable returns
mockSelect.mockReturnValue(queryBuilder);
mockInsert.mockReturnValue(queryBuilder);
mockDelete.mockReturnValue(queryBuilder);
mockEq.mockReturnValue(queryBuilder);
mockNeq.mockReturnValue(queryBuilder);
mockOrder.mockReturnValue(queryBuilder);
mockSingle.mockReturnValue(queryBuilder); // Note: Single usually returns one item, handled in tests

const storageBucket = {
    upload: mockUpload,
    getPublicUrl: mockGetPublicUrl,
    remove: mockRemove
};

const mockStorageFrom = jest.fn(() => storageBucket);
const mockFrom = jest.fn(() => queryBuilder);

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({
        storage: { from: mockStorageFrom },
        from: mockFrom
    }))
}));

// Import App
const app = require('../server');

describe('Server API Endpoints', () => {

    beforeEach(() => {
        jest.clearAllMocks();

        // Default Return Values to avoid "undefined" errors
        // Default Single: returns OK
        mockSingle.mockResolvedValue({ data: {}, error: null });
        // Default Order: returns empty list
        mockOrder.mockResolvedValue({ data: [], error: null });
        // Default delete: returns builder to allow .eq() 
        mockDelete.mockReturnValue(queryBuilder);
        // Default eq: returns builder to allow .single() etc
        mockEq.mockReturnValue(queryBuilder);

        // Default storage
        mockUpload.mockResolvedValue({ data: { path: 'path' }, error: null });
        mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'url' } });
        mockRemove.mockResolvedValue({ data: {}, error: null });

        // Default Sharp
        mockToBuffer.mockResolvedValue(Buffer.from('optimized'));
        mockMetadata.mockResolvedValue({ size: 1024, width: 100, height: 100 });
    });

    describe('GET /api/images/library', () => {
        it('should fetch all images ordered by date', async () => {
            const mockData = [{ id: 1, name: 'Test Image' }];
            // Setup mock implementation
            mockOrder.mockResolvedValue({ data: mockData, error: null });

            const res = await request(app).get('/api/images/library');

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual(mockData);
            expect(mockFrom).toHaveBeenCalledWith('ad_templates');
            expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
        });

        it('should handle errors', async () => {
            mockOrder.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

            const res = await request(app).get('/api/images/library');

            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('POST /api/images/upload', () => {
        it('should upload an image and save metadata', async () => {
            // Setup specific returns
            mockUpload.mockResolvedValue({ data: { path: 'test_path.jpg' }, error: null });
            mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'http://test.com/img.jpg' } });

            mockInsert.mockReturnValue(queryBuilder);
            mockSingle.mockResolvedValue({
                data: { id: 1, name: 'Test Upload', image_url: 'http://test.com/img.jpg' },
                error: null
            });

            // Need to mock select() after insert if the code does .insert().select().single()
            // In server.js: .insert({...}).select().single()
            // My mock chain: insert -> queryBuilder -> select -> queryBuilder -> single -> Promise
            // Wait, does insert return queryBuilder? Yes.
            // Does select return queryBuilder? Yes.
            // Does single return Promise? Yes.

            const buffer = Buffer.from('fake-image-data');

            const res = await request(app)
                .post('/api/images/upload')
                .attach('file', buffer, 'test_image.jpg')
                .field('metadata', JSON.stringify({ name: 'Test Upload' }));

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('id', 1);
            expect(mockUpload).toHaveBeenCalled();
            expect(mockInsert).toHaveBeenCalled();
        });

        it('should fail if no file is provided', async () => {
            const res = await request(app).post('/api/images/upload');
            expect(res.statusCode).toEqual(400);
        });
    });

    describe('DELETE /api/images/:id', () => {
        it('should delete an image from storage and DB', async () => {
            // Mock fetching storage path
            // 1. select('storage_path').eq('id', id).single()

            // eq is called twice. Once for select chain, once for delete chain.
            mockEq
                .mockReturnValueOnce(queryBuilder) // For select().eq()
                .mockResolvedValueOnce({ error: null }); // For delete().eq() -> ends here

            mockSingle.mockResolvedValue({
                data: { storage_path: 'path/on/storage.jpg' },
                error: null
            });

            const res = await request(app).delete('/api/images/123');

            expect(res.statusCode).toEqual(200);
            expect(mockDelete).toHaveBeenCalled();
            expect(mockRemove).toHaveBeenCalled();
        });
    });

    describe('DELETE /api/images/library', () => {
        it('should clear all images from storage and DB', async () => {
            // 1. Fetch paths: select('storage_path')

            // Allow fetch to return some files
            const files = [{ storage_path: 'a.jpg' }, { storage_path: 'b.jpg' }];

            // Configure the specific call to return data upon await
            mockSelect.mockImplementationOnce(() => ({
                then: (resolve) => resolve({ data: files, error: null })
            }));

            // 2. Delete from DB: delete().neq(...)
            // neq returns builder (thenable default works)

            const res = await request(app).delete('/api/images/library');

            expect(res.statusCode).toEqual(200);
            expect(mockRemove).toHaveBeenCalledWith(['a.jpg', 'b.jpg']);
            expect(mockNeq).toHaveBeenCalledWith('id', '00000000-0000-0000-0000-000000000000');
        });
    });
});

